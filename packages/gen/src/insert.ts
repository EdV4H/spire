import {
	buildIndex,
	checkInvariants,
	err,
	type MapDocument,
	type NodeId,
	type NodeTypeId,
	ok,
	type Result,
} from "@edv4h/spire-core";

/**
 * Add a node to an existing map without breaking it.
 *
 * The skeleton generator deliberately leaves columns empty (`walks < cols`), and
 * this is what that room is for: a node can be added later without regenerating
 * and throwing away the progress attached to the map.
 *
 * The search is exhaustive over free cells on the target row and over the ways
 * to wire each one, and every candidate is checked against the full set of
 * topological invariants before it is accepted. So this never returns a map that
 * a renderer cannot draw — it returns `no_space` instead, and the host decides
 * whether to regenerate. v0.1 does not try to be cleverer than that.
 */

export interface InsertRequest {
	type: NodeTypeId;
	/** Row to insert on. Negative counts from the terminal row. */
	row: number;
	/** Preferred column. The nearest workable free cell to it is used. */
	col?: number;
	data?: Record<string, unknown>;
	/** Id for the new node. Defaults to `ins_<col>_<row>`. */
	id?: NodeId;
}

export interface InsertFailure {
	code: "no_space" | "invalid_row" | "duplicate_id" | "unknown_type";
	message: string;
	meta?: Record<string, unknown>;
}

export interface InsertResult {
	map: MapDocument;
	nodeId: NodeId;
}

export function insertNode(
	map: MapDocument,
	request: InsertRequest,
): Result<InsertResult, InsertFailure> {
	const terminalRow = map.grid.rows - 1;
	const row = request.row < 0 ? terminalRow + 1 + request.row : request.row;

	if (row < 0 || row > terminalRow) {
		return err({
			code: "invalid_row",
			message: `Row ${request.row} resolves to ${row}, outside the grid's 0..${terminalRow}.`,
			meta: { row, terminalRow },
		});
	}
	if (!map.nodeTypes.some((type) => type.id === request.type)) {
		return err({
			code: "unknown_type",
			message: `Node type "${request.type}" is not declared in this map's nodeTypes.`,
			meta: { type: request.type, declared: map.nodeTypes.map((t) => t.id) },
		});
	}

	const index = buildIndex(map);
	const occupied = new Set(map.nodes.map((node) => `${node.position.col},${node.position.row}`));

	const preferred = request.col ?? Math.floor(map.grid.cols / 2);
	const freeCols = Array.from({ length: map.grid.cols }, (_, col) => col)
		.filter((col) => !occupied.has(`${col},${row}`))
		.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);

	if (freeCols.length === 0) {
		return err({
			code: "no_space",
			message: `Row ${row} has no free cell. Regenerate the map if it needs to grow.`,
			meta: { row },
		});
	}

	const attempts: string[] = [];

	for (const col of freeCols) {
		const nodeId = request.id ?? `ins_${col}_${row}`;
		if (index.nodesById.has(nodeId)) {
			return err({
				code: "duplicate_id",
				message: `Map already has a node with id "${nodeId}".`,
				meta: { nodeId },
			});
		}

		// Nearest neighbours first: a short edge is less likely to cross another.
		const above = neighbours(map, row - 1, col);
		const below = neighbours(map, row + 1, col);

		const predecessorOptions = row === 0 ? [undefined] : above;
		const successorOptions = row === terminalRow ? [undefined] : below;

		if (predecessorOptions.length === 0 || successorOptions.length === 0) {
			attempts.push(`col ${col}: no neighbour to connect to`);
			continue;
		}

		for (const from of predecessorOptions) {
			for (const to of successorOptions) {
				const candidate = withNode(map, {
					nodeId,
					type: request.type,
					col,
					row,
					from,
					to,
					...(request.data === undefined ? {} : { data: request.data }),
				});

				const errors = checkInvariants(candidate);
				if (errors.length === 0) return ok({ map: candidate, nodeId });
				attempts.push(`col ${col} (${from ?? "-"} → ${to ?? "-"}): ${errors[0]?.code}`);
			}
		}
	}

	return err({
		code: "no_space",
		message: `No free cell on row ${row} could be wired in without breaking an invariant. Regenerate the map instead.`,
		meta: { row, attempts },
	});
}

/** Nodes on a row, nearest column first. */
function neighbours(map: MapDocument, row: number, col: number): NodeId[] {
	return map.nodes
		.filter((node) => node.position.row === row)
		.sort(
			(a, b) =>
				Math.abs(a.position.col - col) - Math.abs(b.position.col - col) ||
				a.position.col - b.position.col,
		)
		.map((node) => node.id);
}

function withNode(
	map: MapDocument,
	spec: {
		nodeId: NodeId;
		type: NodeTypeId;
		col: number;
		row: number;
		from: NodeId | undefined;
		to: NodeId | undefined;
		data?: Record<string, unknown>;
	},
): MapDocument {
	const edges = [...map.edges];
	if (spec.from !== undefined) {
		edges.push({ id: `e_${spec.from}_${spec.nodeId}`, from: spec.from, to: spec.nodeId });
	}
	if (spec.to !== undefined) {
		edges.push({ id: `e_${spec.nodeId}_${spec.to}`, from: spec.nodeId, to: spec.to });
	}

	return {
		...map,
		nodes: [
			...map.nodes,
			{
				id: spec.nodeId,
				type: spec.type,
				position: { col: spec.col, row: spec.row },
				...(spec.data === undefined ? {} : { data: spec.data }),
			},
		],
		edges,
	};
}
