import type { EdgeId, MapDocument, NodeId, SpireEdge, SpireNode } from "../types.js";

/**
 * Derived lookup tables over a map document.
 *
 * Every algorithm here — validation, reachability, path enumeration — needs the
 * same adjacency and position lookups, and building them per call would make
 * validation quadratic. The index is a pure function of the document and is
 * never stored in it.
 */
export interface MapIndex {
	readonly nodesById: ReadonlyMap<NodeId, SpireNode>;
	readonly edgesById: ReadonlyMap<EdgeId, SpireEdge>;
	/** Outgoing node ids, in edge declaration order. */
	readonly outgoing: ReadonlyMap<NodeId, readonly NodeId[]>;
	/** Incoming node ids, in edge declaration order. */
	readonly incoming: ReadonlyMap<NodeId, readonly NodeId[]>;
	/** Node ids per grid row, ascending by column. */
	readonly byRow: ReadonlyMap<number, readonly NodeId[]>;
	/** `"col,row"` → node id. */
	readonly byCell: ReadonlyMap<string, NodeId>;
	/** Row 0 nodes: the map's entry points. */
	readonly startNodes: readonly NodeId[];
	/** Nodes on the last grid row. */
	readonly terminalNodes: readonly NodeId[];
	readonly terminalRow: number;
}

export function cellKey(col: number, row: number): string {
	return `${col},${row}`;
}

export function buildIndex(map: MapDocument): MapIndex {
	const nodesById = new Map<NodeId, SpireNode>();
	const byRow = new Map<number, NodeId[]>();
	const byCell = new Map<string, NodeId>();

	for (const node of map.nodes) {
		nodesById.set(node.id, node);
		const row = byRow.get(node.position.row);
		if (row === undefined) {
			byRow.set(node.position.row, [node.id]);
		} else {
			row.push(node.id);
		}
		// First writer wins; a collision is reported by the position invariant.
		if (!byCell.has(cellKey(node.position.col, node.position.row))) {
			byCell.set(cellKey(node.position.col, node.position.row), node.id);
		}
	}

	for (const ids of byRow.values()) {
		ids.sort((a, b) => {
			const colA = nodesById.get(a)?.position.col ?? 0;
			const colB = nodesById.get(b)?.position.col ?? 0;
			return colA - colB;
		});
	}

	const edgesById = new Map<EdgeId, SpireEdge>();
	const outgoing = new Map<NodeId, NodeId[]>();
	const incoming = new Map<NodeId, NodeId[]>();

	for (const node of map.nodes) {
		outgoing.set(node.id, []);
		incoming.set(node.id, []);
	}

	for (const edge of map.edges) {
		edgesById.set(edge.id, edge);
		const from = outgoing.get(edge.from);
		if (from !== undefined) from.push(edge.to);
		const to = incoming.get(edge.to);
		if (to !== undefined) to.push(edge.from);
	}

	const terminalRow = map.grid.rows - 1;

	return {
		nodesById,
		edgesById,
		outgoing,
		incoming,
		byRow,
		byCell,
		startNodes: byRow.get(0) ?? [],
		terminalNodes: byRow.get(terminalRow) ?? [],
		terminalRow,
	};
}
