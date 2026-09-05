import { err, ok, type Result } from "../result.js";
import type { MapDocument, NodeId, Position, SpireEdge, SpireNode } from "../types.js";
import type { ValidationError } from "../validate/errors.js";
import { checkInvariants } from "../validate/invariants.js";

/**
 * Structural edits.
 *
 * Every function returns a **new** document and re-checks the topological
 * invariants before handing it back, so an edit that would produce a crossing
 * edge or a dead end fails instead of leaving a host with a map its renderer
 * cannot draw. The rejected document is discarded; the caller keeps the
 * original untouched.
 */

export type EditResult = Result<MapDocument, ValidationError[]>;

function validated(map: MapDocument): EditResult {
	const errors = checkInvariants(map);
	return errors.length > 0 ? err(errors) : ok(map);
}

export function addNode(map: MapDocument, node: SpireNode): EditResult {
	return validated({ ...map, nodes: [...map.nodes, node] });
}

/**
 * Remove a node and reconnect around it: every predecessor is wired to every
 * successor, so the map does not gain a dead end. Reconnection edges get ids
 * derived from the pair, which keeps the operation deterministic.
 */
export function removeNode(map: MapDocument, nodeId: NodeId): EditResult {
	if (!map.nodes.some((node) => node.id === nodeId)) {
		return validated(map);
	}

	const predecessors = map.edges.filter((e) => e.to === nodeId).map((e) => e.from);
	const successors = map.edges.filter((e) => e.from === nodeId).map((e) => e.to);

	const kept = map.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
	const existing = new Set(kept.map((e) => `${e.from}->${e.to}`));

	const reconnected: SpireEdge[] = [];
	for (const from of predecessors) {
		for (const to of successors) {
			const key = `${from}->${to}`;
			if (existing.has(key)) continue;
			existing.add(key);
			reconnected.push({ id: `e_${from}_${to}`, from, to });
		}
	}

	return validated({
		...map,
		nodes: map.nodes.filter((node) => node.id !== nodeId),
		edges: [...kept, ...reconnected],
	});
}

export function addEdge(map: MapDocument, edge: SpireEdge): EditResult {
	return validated({ ...map, edges: [...map.edges, edge] });
}

export function removeEdge(map: MapDocument, edgeId: string): EditResult {
	return validated({ ...map, edges: map.edges.filter((edge) => edge.id !== edgeId) });
}

export function moveNode(map: MapDocument, nodeId: NodeId, position: Position): EditResult {
	return validated({
		...map,
		nodes: map.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
	});
}

/**
 * Merge fields into a node's opaque `data`. The SDK never reads inside `data`,
 * so this needs no validation beyond the node existing — but it still runs the
 * invariants, because a host may have registered a data schema for the type.
 */
export function updateNodeData(
	map: MapDocument,
	nodeId: NodeId,
	data: Record<string, unknown>,
): EditResult {
	return validated({
		...map,
		nodes: map.nodes.map((node) =>
			node.id === nodeId ? { ...node, data: { ...(node.data ?? {}), ...data } } : node,
		),
	});
}

export function setNodeType(map: MapDocument, nodeId: NodeId, type: string): EditResult {
	return validated({
		...map,
		nodes: map.nodes.map((node) => (node.id === nodeId ? { ...node, type } : node)),
	});
}
