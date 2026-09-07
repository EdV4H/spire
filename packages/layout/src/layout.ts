import { createRng, type MapDocument } from "@edv4h/spire-core";
import type {
	EdgeLayout,
	LayoutOptions,
	LayoutResult,
	NodeLayout,
	Orientation,
	Point,
} from "./types.js";

/**
 * Grid coordinates to screen coordinates.
 *
 * This lives in its own package because the React renderer and the static SVG
 * renderer must agree exactly — a share image that does not match what the user
 * saw on screen is worse than no share image. Nothing here draws anything, and
 * nothing here touches the DOM.
 */

const DEFAULTS = {
	orientation: "bottom-up" as Orientation,
	spacing: { col: 96, row: 120 },
	padding: 48,
	curvature: 0.45,
} as const;

export function layout(map: MapDocument, options: LayoutOptions = {}): LayoutResult {
	const orientation = options.orientation ?? DEFAULTS.orientation;
	const spacing = options.spacing ?? DEFAULTS.spacing;
	const padding = options.padding ?? DEFAULTS.padding;
	const curvature = options.curvature ?? DEFAULTS.curvature;

	const horizontal = orientation === "left-right" || orientation === "right-left";
	const span = {
		width: horizontal ? (map.grid.rows - 1) * spacing.row : (map.grid.cols - 1) * spacing.col,
		height: horizontal ? (map.grid.cols - 1) * spacing.col : (map.grid.rows - 1) * spacing.row,
	};

	const jitterFor = makeJitter(map, options);

	const nodes: Record<string, NodeLayout> = {};
	for (const node of map.nodes) {
		const base = project(node.position, map, orientation, spacing);
		const offset = jitterFor(node.id);
		nodes[node.id] = {
			id: node.id,
			center: { x: base.x + offset.x + padding, y: base.y + offset.y + padding },
			anchor: { x: base.x + padding, y: base.y + padding },
			cell: { col: node.position.col, row: node.position.row },
		};
	}

	const edges: Record<string, EdgeLayout> = {};
	for (const edge of map.edges) {
		const from = nodes[edge.from];
		const to = nodes[edge.to];
		if (from === undefined || to === undefined) continue;

		const control = controlPoints(from.center, to.center, horizontal, curvature);
		edges[edge.id] = {
			id: edge.id,
			from: edge.from,
			to: edge.to,
			start: from.center,
			end: to.center,
			control,
			path: bezierPath(from.center, control, to.center),
		};
	}

	return {
		size: { width: span.width + padding * 2, height: span.height + padding * 2 },
		nodes,
		edges,
		orientation,
	};
}

function project(
	position: { col: number; row: number },
	map: MapDocument,
	orientation: Orientation,
	spacing: { col: number; row: number },
): Point {
	const alongCol = position.col * spacing.col;
	const alongRow = position.row * spacing.row;
	const flippedRow = (map.grid.rows - 1 - position.row) * spacing.row;

	switch (orientation) {
		case "top-down":
			return { x: alongCol, y: alongRow };
		case "bottom-up":
			return { x: alongCol, y: flippedRow };
		case "left-right":
			return { x: alongRow, y: alongCol };
		case "right-left":
			return { x: flippedRow, y: alongCol };
	}
}

/**
 * Per-node displacement that makes a rectangular grid read as an organic path.
 *
 * Keyed on the node id rather than on iteration order, so inserting or removing
 * a node does not shuffle the whole map's appearance, and derived from the
 * map's seed so the same document renders identically everywhere.
 */
function makeJitter(map: MapDocument, options: LayoutOptions): (nodeId: string) => Point {
	const amount = options.jitter?.amount ?? 0;
	if (amount === 0) return () => ({ x: 0, y: 0 });

	const seed = options.jitter?.seed ?? map.seed ?? 0;
	const cache = new Map<string, Point>();

	return (nodeId) => {
		const cached = cache.get(nodeId);
		if (cached !== undefined) return cached;

		const rng = createRng(seed + hashString(nodeId));
		const point = {
			x: (rng.next() * 2 - 1) * amount,
			y: (rng.next() * 2 - 1) * amount,
		};
		cache.set(nodeId, point);
		return point;
	};
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/**
 * Control points pulled along the map's main axis, so a branch leaves its
 * parent going "forward" and arrives at its child the same way, rather than
 * cutting a straight diagonal.
 */
function controlPoints(
	start: Point,
	end: Point,
	horizontal: boolean,
	curvature: number,
): readonly [Point, Point] {
	if (horizontal) {
		const dx = (end.x - start.x) * curvature;
		return [
			{ x: start.x + dx, y: start.y },
			{ x: end.x - dx, y: end.y },
		];
	}
	const dy = (end.y - start.y) * curvature;
	return [
		{ x: start.x, y: start.y + dy },
		{ x: end.x, y: end.y - dy },
	];
}

function bezierPath(start: Point, control: readonly [Point, Point], end: Point): string {
	const round = (value: number) => Math.round(value * 100) / 100;
	return [
		`M ${round(start.x)} ${round(start.y)}`,
		`C ${round(control[0].x)} ${round(control[0].y)}`,
		`${round(control[1].x)} ${round(control[1].y)}`,
		`${round(end.x)} ${round(end.y)}`,
	].join(" ");
}
