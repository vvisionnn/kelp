import { join } from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { ClusterNode, MountClient, Topic } from "../../shared/api.ts";
import { list, nanos, num, type Raw, str } from "../map/raw.ts";
import { UpstreamError } from "./http.ts";

// The bundled server (Docker image) sets KELP_PROTO_DIR; from source the protos sit at the repo root.
const PROTO_DIR = process.env.KELP_PROTO_DIR || join(import.meta.dir, "../../proto");

// biome-ignore lint/suspicious/noExplicitAny: grpc-js package definitions are untyped at runtime.
type GrpcPackage = any;
let cached: GrpcPackage | undefined;

/** Loads the vendored SeaweedFS protobuf definitions once. */
export function loadSeaweedProtos(): GrpcPackage {
	cached ??= grpc.loadPackageDefinition(
		protoLoader.loadSync(["master.proto", "filer.proto", "mq_broker.proto"], {
			includeDirs: [PROTO_DIR],
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
		}),
	);
	return cached;
}

/** Strips the build-size tag SeaweedFS prefixes to versions ("30GB 4.52 abc" -> "4.52 abc"). */
export const cleanVersion = (version: string) => version.replace(/^\d+GB\s+/, "");

/**
 * Cluster node addresses look like `host:httpPort.grpcPort`; without the suffix the gRPC port is
 * the HTTP port + 10000.
 */
export function grpcFromClusterAddress(address: string): { display: string; grpc: string } {
	const match = /^(.*):(\d+)(?:\.(\d+))?$/.exec(address);
	if (!match) return { display: address, grpc: address };
	const [, host, port, grpcPort] = match;
	return { display: `${host}:${port}`, grpc: `${host}:${grpcPort ?? Number(port) + 10000}` };
}

export interface ClusterGrpc {
	listClusterNodes(type: "filer" | "s3" | "broker"): Promise<ClusterNode[]>;
	listMountClients(filers: Array<{ display: string; grpc: string }>): Promise<MountClient[]>;
	listTopics(broker: string): Promise<Topic[]>;
	/** The broker currently balancing partitions, asked of `broker` (addresses are gRPC addresses). */
	findBrokerLeader(broker: string): Promise<string>;
	close(): void;
}

/** gRPC calls the native admin API does not expose: cluster membership, mounts and MQ topics. */
export class SeaweedGrpc implements ClusterGrpc {
	private readonly pkg = loadSeaweedProtos();
	private readonly clients = new Map<string, grpc.Client>();
	private readonly timeoutMs: number;

	constructor(
		private readonly masterAddress: string,
		options: { timeoutMs?: number } = {},
	) {
		this.timeoutMs = options.timeoutMs ?? 5000;
	}

	async listClusterNodes(type: "filer" | "s3" | "broker"): Promise<ClusterNode[]> {
		const response = await this.call(this.masterAddress, "master", "ListClusterNodes", { client_type: type });
		return list(response.cluster_nodes).map((node) => ({
			address: grpcFromClusterAddress(str(node.address)).display,
			version: cleanVersion(str(node.version)),
			dataCenter: str(node.data_center),
			rack: str(node.rack),
			createdAt: nanos(node.created_at_ns),
		}));
	}

	async listMountClients(filers: Array<{ display: string; grpc: string }>): Promise<MountClient[]> {
		const perFiler = await Promise.all(
			filers.map(async (filer) => {
				try {
					const response = await this.call(filer.grpc, "filer", "ListMetadataSubscribers", {
						client_types: ["mount", "sw-vfs"],
					});
					return list(response.subscribers).map(
						(s): MountClient => ({
							filer: str(s.filer_address) || filer.display,
							clientName: str(s.client_name),
							clientId: String(num(s.client_id)),
							clientType: str(s.client_type),
							path: str(s.path_prefix) || "/",
							version: "",
							address: str(s.address),
							connectedAt: nanos(s.connected_at_ns),
						}),
					);
				} catch {
					// One unreachable filer should not hide mounts on the others.
					return [];
				}
			}),
		);
		return perFiler.flat();
	}

	async listTopics(broker: string): Promise<Topic[]> {
		const response = await this.call(broker, "broker", "ListTopics", {});
		return list(response.topics)
			.map((t) => ({ namespace: str(t.namespace), name: str(t.name) }))
			.sort((a, b) => `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`));
	}

	async findBrokerLeader(broker: string): Promise<string> {
		const response = await this.call(broker, "broker", "FindBrokerLeader", {});
		return str(response.broker);
	}

	close(): void {
		for (const client of this.clients.values()) client.close();
		this.clients.clear();
	}

	private client(address: string, kind: "master" | "filer" | "broker"): grpc.Client {
		const key = `${kind}@${address}`;
		let client = this.clients.get(key);
		if (!client) {
			const Service =
				kind === "master"
					? this.pkg.master_pb.Seaweed
					: kind === "filer"
						? this.pkg.filer_pb.SeaweedFiler
						: this.pkg.messaging_pb.SeaweedMessaging;
			client = new Service(address, grpc.credentials.createInsecure()) as grpc.Client;
			this.clients.set(key, client);
		}
		return client;
	}

	private call(
		address: string,
		kind: "master" | "filer" | "broker",
		method: string,
		request: object,
	): Promise<Raw> {
		const client = this.client(address, kind) as unknown as Record<
			string,
			(
				req: object,
				options: grpc.CallOptions,
				done: (error: grpc.ServiceError | null, response: Raw) => void,
			) => void
		>;
		return new Promise((resolve, reject) => {
			client[method]?.(request, { deadline: Date.now() + this.timeoutMs }, (error, response) => {
				if (error) {
					const status = error.code === grpc.status.DEADLINE_EXCEEDED ? 504 : 502;
					reject(
						new UpstreamError("grpc", status, `${kind} ${method} failed: ${error.details || error.message}`),
					);
				} else resolve(response);
			});
		});
	}
}
