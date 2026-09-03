import { buildIndex, type MapIndex } from "../graph/index-map.js";
import type { MapDocument, NodeId, NodeStatus, Progress, StateDocument } from "../types.js";

/**
 * Everything in this module is derived from `state.completed` plus the map.
 * Nothing here is ever stored — that separation is what lets two clients merge
 * progress by merging a completion set (design doc §2.2).
 */

export function getNodeStatus(
	map: MapDocument,
	state: StateDocument,
	nodeId: NodeId,
	index: MapIndex = buildIndex(map),
): NodeStatus {
	if (state.completed[nodeId] !== undefined) return "completed";

	const node = index.nodesById.get(nodeId);
	if (node === undefined) return "locked";

	// A start node needs no predecessor; anything else needs a completed one.
	if (node.position.row === 0) return "reachable";

	for (const predecessor of index.incoming.get(nodeId) ?? []) {
		if (state.completed[predecessor] !== undefined) return "reachable";
	}

	return "locked";
}

export function getReachableNodes(
	map: MapDocument,
	state: StateDocument,
	index: MapIndex = buildIndex(map),
): NodeId[] {
	return map.nodes
		.filter((node) => getNodeStatus(map, state, node.id, index) === "reachable")
		.map((node) => node.id);
}

export function getProgress(map: MapDocument, state: StateDocument): Progress {
	const index = buildIndex(map);
	const total = map.nodes.length;

	let completedCount = 0;
	let reachableCount = 0;
	for (const node of map.nodes) {
		const status = getNodeStatus(map, state, node.id, index);
		if (status === "completed") completedCount += 1;
		else if (status === "reachable") reachableCount += 1;
	}

	return {
		completedCount,
		total,
		ratio: total === 0 ? 0 : completedCount / total,
		reachableCount,
		longestCompletedPath: longestCompletedPath(map, state, index),
		reachedTerminal: index.terminalNodes.some((id) => state.completed[id] !== undefined),
	};
}

/**
 * Length, in nodes, of the longest chain of completed nodes following edges.
 * Edges run strictly downward in a valid map, so a single memoized pass over
 * the completed subgraph suffices; the visiting guard keeps it terminating even
 * on a document that has not been validated.
 */
function longestCompletedPath(map: MapDocument, state: StateDocument, index: MapIndex): number {
	const memo = new Map<NodeId, number>();
	const visiting = new Set<NodeId>();

	const walk = (id: NodeId): number => {
		if (state.completed[id] === undefined) return 0;
		const cached = memo.get(id);
		if (cached !== undefined) return cached;
		if (visiting.has(id)) return 0;

		visiting.add(id);
		let best = 0;
		for (const next of index.outgoing.get(id) ?? []) {
			best = Math.max(best, walk(next));
		}
		visiting.delete(id);

		const length = best + 1;
		memo.set(id, length);
		return length;
	};

	let longest = 0;
	for (const node of map.nodes) longest = Math.max(longest, walk(node.id));
	return longest;
}
