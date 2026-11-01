import { buildIndex, type MapIndex } from "../graph/index-map.js";
import type { MapDocument, NodeId, StateDocument } from "../types.js";

/** One thing a node receives: the `output` of a completed node right before it. */
export interface NodeInput {
	from: NodeId;
	output: unknown;
}

/**
 * What a node receives from the route that led to it: the `output` of each
 * completed direct predecessor, in edge declaration order.
 *
 * Only completed predecessors count, so under `single-route` this is the arm of
 * a branch that was actually walked — the arm turned away from was never
 * completed and contributes nothing. Under policies that allow several arms,
 * every completed arm contributes, which is what a merge node should see.
 *
 * Predecessors completed without an `output` are left out: they handed nothing
 * on. The SDK passes outputs through untouched; what they mean is the host's.
 */
export function inputsOf(
	map: MapDocument,
	state: StateDocument,
	nodeId: NodeId,
	index: MapIndex = buildIndex(map),
): NodeInput[] {
	const inputs: NodeInput[] = [];
	for (const from of index.incoming.get(nodeId) ?? []) {
		const record = state.completed[from];
		if (record === undefined || record.output === undefined) continue;
		inputs.push({ from, output: record.output });
	}
	return inputs;
}
