import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as grpc from "@grpc/grpc-js";
import { grpcFromClusterAddress, loadSeaweedProtos, SeaweedGrpc } from "./grpc.ts";

/** In-process fake of the master, filer and broker gRPC services. */
let server: grpc.Server;
let address: string;
let failMount = false;

beforeAll(async () => {
	const pkg = loadSeaweedProtos();
	server = new grpc.Server();
	server.addService(pkg.master_pb.Seaweed.service, {
		ListClusterNodes(
			call: grpc.ServerUnaryCall<{ client_type: string }, unknown>,
			done: grpc.sendUnaryData<unknown>,
		) {
			const byType: Record<string, unknown[]> = {
				filer: [
					{
						address: "10.0.0.5:8888.18888",
						version: "30GB 4.52 abc",
						created_at_ns: "1793798281888855000",
						data_center: "dc1",
						rack: "r1",
					},
				],
				s3: [
					{
						address: "10.0.0.6:8333",
						version: "30GB 4.52 abc",
						created_at_ns: "0",
						data_center: "",
						rack: "",
					},
				],
			};
			done(null, { cluster_nodes: byType[call.request.client_type] ?? [] });
		},
	});
	server.addService(pkg.filer_pb.SeaweedFiler.service, {
		ListMetadataSubscribers(
			call: grpc.ServerUnaryCall<{ client_types: string[] }, unknown>,
			done: grpc.sendUnaryData<unknown>,
		) {
			if (failMount)
				return done({ code: grpc.status.UNAVAILABLE, message: "filer down" } as grpc.ServiceError);
			expect(call.request.client_types).toEqual(["mount", "sw-vfs"]);
			done(null, {
				subscribers: [
					{
						client_name: "mount@10.0.0.9:1",
						client_type: "mount",
						address: "10.0.0.9:51000",
						path_prefix: "/data",
						client_id: 7,
						connected_at_ns: "1793798281888855000",
						filer_address: "",
					},
				],
			});
		},
	});
	server.addService(pkg.messaging_pb.SeaweedMessaging.service, {
		ListTopics(_call: unknown, done: grpc.sendUnaryData<unknown>) {
			done(null, {
				topics: [
					{ namespace: "events", name: "orders" },
					{ namespace: "events", name: "audit" },
				],
			});
		},
		FindBrokerLeader(_call: unknown, done: grpc.sendUnaryData<unknown>) {
			done(null, { broker: "10.0.0.7:17777" });
		},
	});
	const port = await new Promise<number>((resolve, reject) =>
		server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (e, p) =>
			e ? reject(e) : resolve(p),
		),
	);
	address = `127.0.0.1:${port}`;
});
afterAll(() => server.forceShutdown());

describe("grpcFromClusterAddress", () => {
	test("reads the gRPC port SeaweedFS appends after a dot", () => {
		expect(grpcFromClusterAddress("10.0.0.5:8888.18888")).toEqual({
			display: "10.0.0.5:8888",
			grpc: "10.0.0.5:18888",
		});
	});

	test("derives the gRPC port when it is not advertised", () => {
		expect(grpcFromClusterAddress("10.0.0.6:8333")).toEqual({
			display: "10.0.0.6:8333",
			grpc: "10.0.0.6:18333",
		});
	});
});

describe("SeaweedGrpc", () => {
	test("lists cluster nodes by type with readable addresses", async () => {
		const client = new SeaweedGrpc(address);
		expect(await client.listClusterNodes("filer")).toEqual([
			{
				address: "10.0.0.5:8888",
				version: "4.52 abc",
				dataCenter: "dc1",
				rack: "r1",
				createdAt: "2026-11-04T13:18:01.888Z",
			},
		]);
		expect((await client.listClusterNodes("s3"))[0]).toMatchObject({
			address: "10.0.0.6:8333",
			createdAt: null,
		});
		expect(await client.listClusterNodes("broker")).toEqual([]);
		client.close();
	});

	test("lists mount clients from each filer, tagging the filer", async () => {
		const client = new SeaweedGrpc(address);
		failMount = false;
		expect(await client.listMountClients([{ display: "f1:8888", grpc: address }])).toEqual([
			{
				filer: "f1:8888",
				clientName: "mount@10.0.0.9:1",
				clientId: "7",
				clientType: "mount",
				path: "/data",
				version: "",
				address: "10.0.0.9:51000",
				connectedAt: "2026-11-04T13:18:01.888Z",
			},
		]);
		client.close();
	});

	test("skips filers that fail instead of failing the whole list", async () => {
		const client = new SeaweedGrpc(address);
		failMount = true;
		expect(await client.listMountClients([{ display: "f1:8888", grpc: address }])).toEqual([]);
		failMount = false;
		client.close();
	});

	test("lists message queue topics from a broker", async () => {
		const client = new SeaweedGrpc(address);
		expect(await client.listTopics(address)).toEqual([
			{ namespace: "events", name: "audit" },
			{ namespace: "events", name: "orders" },
		]);
		client.close();
	});

	test("asks a broker which broker leads", async () => {
		const client = new SeaweedGrpc(address);
		expect(await client.findBrokerLeader(address)).toBe("10.0.0.7:17777");
		client.close();
	});

	test("reports unreachable services as an upstream error", async () => {
		const client = new SeaweedGrpc("127.0.0.1:1", { timeoutMs: 300 });
		await expect(client.listClusterNodes("filer")).rejects.toMatchObject({ upstream: "grpc", status: 502 });
		client.close();
	});
});
