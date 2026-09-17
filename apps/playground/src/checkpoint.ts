import type { NodeTypeId, ProgressionPolicyDefinition } from "@edv4h/spire-core";

/**
 * The other way to make a node unavoidable: leave the map branchy and refuse to
 * let progress pass an uncleared checkpoint.
 *
 * Compare with `chokeRows`, which does it structurally — there the map has one
 * node on that row and no route around it exists. Here routes around it do
 * exist and the policy declines to walk them, so the shape of the map is
 * untouched and the rule lives entirely in progression.
 *
 * Checkpoints are named by node **type**, so `fixedRow` can plant them:
 * `{ "rule": "fixedRow", "row": 5, "type": "boss" }` puts a row of bosses, and
 * this policy turns that row into a gate.
 */
export function createCheckpointPolicy(type: NodeTypeId): ProgressionPolicyDefinition {
	return {
		id: "checkpoint",
		canComplete: (ctx) => {
			if (ctx.status !== "reachable") return false;

			const node = ctx.map.nodes.find((candidate) => candidate.id === ctx.nodeId);
			if (node === undefined) return false;

			const checkpoints = ctx.map.nodes.filter((candidate) => candidate.type === type);
			const gateRows = new Set(
				checkpoints
					.filter((candidate) => candidate.position.row < node.position.row)
					.map((candidate) => candidate.position.row),
			);

			// One cleared checkpoint per gate row, not all of them: a route passes
			// through a single node on any given row, so requiring every checkpoint
			// would demand walking the map sideways.
			return [...gateRows].every((row) =>
				checkpoints.some(
					(candidate) =>
						candidate.position.row === row && ctx.state.completed[candidate.id] !== undefined,
				),
			);
		},
	};
}
