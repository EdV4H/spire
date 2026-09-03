import { buildIndex, cellKey } from "../graph/index-map.js";
import type { MapDocument, NodeId, Position, SpireEdge } from "../types.js";
import { type ValidationError, validationError } from "./errors.js";

/**
 * The topological invariants of the Spire Map Format (design doc §2.1).
 *
 * These are what makes "layout is part of the contract" safe to rely on: a
 * renderer can draw a valid document without solving anything, because the
 * document already guarantees the drawing will not self-intersect.
 *
 * Every check takes the whole document and returns every violation it finds.
 * None of them stop at the first problem.
 */

interface Point {
	x: number;
	y: number;
}

function toPoint(position: Position): Point {
	return { x: position.col, y: position.row };
}

/** Sign of the cross product (a→b) × (a→c): 1 left turn, -1 right turn, 0 collinear. */
function orientation(a: Point, b: Point, c: Point): number {
	const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
	if (value > 0) return 1;
	if (value < 0) return -1;
	return 0;
}

function withinBox(a: Point, b: Point, p: Point): boolean {
	return (
		p.x >= Math.min(a.x, b.x) &&
		p.x <= Math.max(a.x, b.x) &&
		p.y >= Math.min(a.y, b.y) &&
		p.y <= Math.max(a.y, b.y)
	);
}

/** Whether `p` lies on the closed segment `a`–`b`. */
function onSegment(a: Point, b: Point, p: Point): boolean {
	return orientation(a, b, p) === 0 && withinBox(a, b, p);
}

/**
 * Whether two segments cross at an interior point of both. Touching at an
 * endpoint is *not* a crossing here: that case is a node sitting on another
 * edge, which `edgeThroughNode` reports with a more specific code.
 */
function segmentsProperlyCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
	const o1 = orientation(a1, a2, b1);
	const o2 = orientation(a1, a2, b2);
	const o3 = orientation(b1, b2, a1);
	const o4 = orientation(b1, b2, a2);

	if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true;

	// Collinear and overlapping in more than a single point.
	if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
		const overlapX =
			Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) -
			Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
		const overlapY =
			Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) -
			Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
		return overlapX > 0 || overlapY > 0;
	}

	return false;
}

export function checkDuplicateIds(map: MapDocument): ValidationError[] {
	const errors: ValidationError[] = [];

	const check = (
		items: readonly { id: string }[],
		field: "nodes" | "edges" | "nodeTypes",
		label: string,
	) => {
		const seen = new Set<string>();
		items.forEach((item, i) => {
			if (seen.has(item.id)) {
				errors.push(
					validationError("duplicate_id", [field, i, "id"], `Duplicate ${label} id "${item.id}".`, {
						id: item.id,
					}),
				);
			}
			seen.add(item.id);
		});
	};

	check(map.nodeTypes, "nodeTypes", "node type");
	check(map.nodes, "nodes", "node");
	check(map.edges, "edges", "edge");
	return errors;
}

export function checkReferentialIntegrity(map: MapDocument): ValidationError[] {
	const errors: ValidationError[] = [];
	const nodeIds = new Set(map.nodes.map((n) => n.id));
	const typeIds = new Set(map.nodeTypes.map((t) => t.id));

	map.nodes.forEach((node, i) => {
		if (!typeIds.has(node.type)) {
			errors.push(
				validationError(
					"ref_integrity",
					["nodes", i, "type"],
					`Node "${node.id}" has type "${node.type}", which is not declared in nodeTypes.`,
					{ nodeId: node.id, type: node.type },
				),
			);
		}
	});

	map.edges.forEach((edge, i) => {
		for (const end of ["from", "to"] as const) {
			if (!nodeIds.has(edge[end])) {
				errors.push(
					validationError(
						"ref_integrity",
						["edges", i, end],
						`Edge "${edge.id}" points at "${edge[end]}", which is not a node.`,
						{ edgeId: edge.id, nodeId: edge[end] },
					),
				);
			}
		}
	});

	return errors;
}

export function checkPositions(map: MapDocument): ValidationError[] {
	const errors: ValidationError[] = [];
	const occupied = new Map<string, NodeId>();

	map.nodes.forEach((node, i) => {
		const { col, row } = node.position;
		if (col < 0 || col >= map.grid.cols || row < 0 || row >= map.grid.rows) {
			errors.push(
				validationError(
					"position_range",
					["nodes", i, "position"],
					`Node "${node.id}" at (${col}, ${row}) is outside the ${map.grid.cols}x${map.grid.rows} grid.`,
					{ nodeId: node.id, position: node.position, grid: map.grid },
				),
			);
		}

		const key = cellKey(col, row);
		const existing = occupied.get(key);
		if (existing !== undefined) {
			errors.push(
				validationError(
					"position_collision",
					["nodes", i, "position"],
					`Nodes "${existing}" and "${node.id}" both occupy cell (${col}, ${row}).`,
					{ nodeIds: [existing, node.id], position: node.position },
				),
			);
		} else {
			occupied.set(key, node.id);
		}
	});

	return errors;
}

export function checkEdgeDirection(map: MapDocument): ValidationError[] {
	const errors: ValidationError[] = [];
	const index = buildIndex(map);

	map.edges.forEach((edge, i) => {
		const from = index.nodesById.get(edge.from);
		const to = index.nodesById.get(edge.to);
		if (from === undefined || to === undefined) return; // reported by ref integrity

		if (from.position.row >= to.position.row) {
			errors.push(
				validationError(
					"edge_direction",
					["edges", i],
					`Edge "${edge.id}" runs from row ${from.position.row} to row ${to.position.row}; edges must go strictly downward.`,
					{ edgeId: edge.id, fromRow: from.position.row, toRow: to.position.row },
				),
			);
		}
	});

	return errors;
}

export function checkAcyclic(map: MapDocument): ValidationError[] {
	const index = buildIndex(map);
	const state = new Map<NodeId, "visiting" | "done">();
	const errors: ValidationError[] = [];

	const visit = (id: NodeId, stack: NodeId[]): boolean => {
		const current = state.get(id);
		if (current === "done") return false;
		if (current === "visiting") {
			const start = stack.indexOf(id);
			const cycle = start >= 0 ? [...stack.slice(start), id] : [id];
			errors.push(
				validationError("dag_cycle", ["edges"], `Edges form a cycle: ${cycle.join(" → ")}.`, {
					cycle,
				}),
			);
			return true;
		}

		state.set(id, "visiting");
		stack.push(id);
		for (const next of index.outgoing.get(id) ?? []) {
			if (visit(next, stack)) {
				stack.pop();
				state.set(id, "done");
				return true;
			}
		}
		stack.pop();
		state.set(id, "done");
		return false;
	};

	for (const node of map.nodes) {
		if (state.get(node.id) === undefined && visit(node.id, [])) break;
	}

	return errors;
}

export function checkDegrees(map: MapDocument): ValidationError[] {
	const errors: ValidationError[] = [];
	const index = buildIndex(map);

	map.nodes.forEach((node, i) => {
		const { row } = node.position;
		if (row !== 0 && (index.incoming.get(node.id)?.length ?? 0) === 0) {
			errors.push(
				validationError(
					"degree_in",
					["nodes", i],
					`Node "${node.id}" on row ${row} has no incoming edge; only row 0 may be an entry point.`,
					{ nodeId: node.id, row },
				),
			);
		}
		if (row !== index.terminalRow && (index.outgoing.get(node.id)?.length ?? 0) === 0) {
			errors.push(
				validationError(
					"degree_out",
					["nodes", i],
					`Node "${node.id}" on row ${row} has no outgoing edge; only the terminal row ${index.terminalRow} may be a dead end.`,
					{ nodeId: node.id, row, terminalRow: index.terminalRow },
				),
			);
		}
	});

	return errors;
}

export function checkEdgeCrossings(map: MapDocument): ValidationError[] {
	const errors: ValidationError[] = [];
	const index = buildIndex(map);

	const endpoints = (edge: SpireEdge): { a: Point; b: Point } | undefined => {
		const from = index.nodesById.get(edge.from);
		const to = index.nodesById.get(edge.to);
		if (from === undefined || to === undefined) return undefined;
		return { a: toPoint(from.position), b: toPoint(to.position) };
	};

	for (let i = 0; i < map.edges.length; i++) {
		const first = map.edges[i];
		if (first === undefined) continue;
		const one = endpoints(first);
		if (one === undefined) continue;

		for (let j = i + 1; j < map.edges.length; j++) {
			const second = map.edges[j];
			if (second === undefined) continue;
			// Edges meeting at a shared node are a branch or a merge, not a crossing.
			if (
				first.from === second.from ||
				first.from === second.to ||
				first.to === second.from ||
				first.to === second.to
			) {
				continue;
			}

			const other = endpoints(second);
			if (other === undefined) continue;

			if (segmentsProperlyCross(one.a, one.b, other.a, other.b)) {
				errors.push(
					validationError(
						"edge_crossing",
						["edges", j],
						`Edges "${first.id}" and "${second.id}" cross when drawn on the grid.`,
						{ edgeIds: [first.id, second.id] },
					),
				);
			}
		}
	}

	return errors;
}

export function checkEdgesThroughNodes(map: MapDocument): ValidationError[] {
	const errors: ValidationError[] = [];
	const index = buildIndex(map);

	map.edges.forEach((edge, i) => {
		const from = index.nodesById.get(edge.from);
		const to = index.nodesById.get(edge.to);
		if (from === undefined || to === undefined) return;

		const a = toPoint(from.position);
		const b = toPoint(to.position);

		for (const node of map.nodes) {
			if (node.id === edge.from || node.id === edge.to) continue;
			if (onSegment(a, b, toPoint(node.position))) {
				errors.push(
					validationError(
						"edge_through_node",
						["edges", i],
						`Edge "${edge.id}" passes through node "${node.id}" at (${node.position.col}, ${node.position.row}).`,
						{ edgeId: edge.id, nodeId: node.id },
					),
				);
			}
		}
	});

	return errors;
}

/** Every built-in invariant, in the order their errors read best. */
export function checkInvariants(map: MapDocument): ValidationError[] {
	return [
		...checkDuplicateIds(map),
		...checkReferentialIntegrity(map),
		...checkPositions(map),
		...checkEdgeDirection(map),
		...checkAcyclic(map),
		...checkDegrees(map),
		...checkEdgeCrossings(map),
		...checkEdgesThroughNodes(map),
	];
}
