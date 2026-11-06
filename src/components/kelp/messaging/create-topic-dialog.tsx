import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Collapse } from "@/components/kelp/maintenance/parts.tsx";
import { draftFrom, RetentionFields, retentionFrom } from "@/components/kelp/messaging/retention.tsx";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function CreateTopicDialog() {
	const [open, setOpen] = useState(false);
	const [namespace, setNamespace] = useState("");
	const [name, setName] = useState("");
	const [partitions, setPartitions] = useState(4);
	const [retention, setRetention] = useState(draftFrom({ enabled: true, seconds: 7 * 86_400 }));
	const navigate = useNavigate();
	const create = useAction({
		run: () =>
			api.post("/messaging/topics", {
				namespace: namespace.trim(),
				name: name.trim(),
				partitionCount: partitions,
				retention: retentionFrom(retention),
			}),
		success: () => `Topic ${namespace.trim()}.${name.trim()} created`,
		invalidate: [["messaging"]],
		onSuccess: () => {
			setOpen(false);
			navigate({
				to: "/messaging/$namespace/$topic",
				params: { namespace: namespace.trim(), topic: name.trim() },
			});
		},
	});
	const invalid =
		(namespace && !NAME.test(namespace.trim())) || (name && !NAME.test(name.trim()))
			? "Names use letters, digits, dots, dashes and underscores."
			: null;
	const ready = NAME.test(namespace.trim()) && NAME.test(name.trim()) && partitions >= 1 && partitions <= 100;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) create.reset();
			}}
		>
			<DialogTrigger
				render={
					<Button>
						<Plus />
						Create topic
					</Button>
				}
			/>
			<DialogContent className="sm:max-w-md">
				<form
					className="grid gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						if (ready) create.mutate();
					}}
				>
					<DialogHeader>
						<DialogTitle>Create topic</DialogTitle>
						<DialogDescription>Publishers and subscribers address it as namespace.name.</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-1.5">
							<Label htmlFor="topic-namespace">Namespace</Label>
							<Input
								id="topic-namespace"
								placeholder="orders"
								value={namespace}
								onChange={(e) => setNamespace(e.target.value)}
								autoComplete="off"
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="topic-name">Name</Label>
							<Input
								id="topic-name"
								placeholder="created"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoComplete="off"
							/>
						</div>
					</div>
					<Collapse open={Boolean(invalid)} className="-mt-3">
						<p className="text-[12px] text-destructive">{invalid}</p>
					</Collapse>
					<div className="grid gap-1.5">
						<Label htmlFor="topic-partitions">Partitions</Label>
						<Input
							id="topic-partitions"
							type="number"
							min={1}
							max={100}
							className="w-24 tabular"
							value={partitions}
							onChange={(e) => setPartitions(Math.floor(Number(e.target.value) || 0))}
						/>
						<p className="text-[12px] text-muted-foreground">
							More partitions allow more parallel consumers. 1 to 100.
						</p>
					</div>
					<RetentionFields draft={retention} onChange={setRetention} />
					<DialogFooter>
						<Button type="submit" disabled={!ready || create.isPending} pending={create.isPending}>
							Create topic
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
