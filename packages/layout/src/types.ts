import type { EdgeId, NodeId } from "@edv4h/spire-core";

/**
 * The direction the map reads in. Grid row 0 is always the map's start; the
 * orientation decides where that ends up on screen, so a bottom-up "climb"
 * and a top-down "flow" are the same document.
 */
export type Orientation = "bottom-up" | "top-down" | "left-right" | "right-left";

export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface JitterOptions {
	/** Maximum displacement in px, applied independently on each axis. */
	amount: number;
	/**
	 * Seed for the displacement. Defaults to the map's own `seed`, so the same
	 * document always looks the same without the host tracking anything.
	 */
	seed?: number;
}

export interface LayoutOptions {
	orientation?: Orientation;
	/** Distance between adjacent columns and rows, in px. */
	spacing?: { col: number; row: number };
	jitter?: JitterOptions;
	/** Margin around the whole map, in px. */
	padding?: number;
	/**
	 * How far the bezier control points sit along the edge, as a fraction of the
	 * distance between the two nodes. 0 draws straight lines.
	 */
	curvature?: number;
}

export interface NodeLayout {
	id: NodeId;
	/** Screen position of the node's centre. */
	center: Point;
	/** Grid cell this came from, for hit-testing back to the document. */
	cell: { col: number; row: number };
}

export interface EdgeLayout {
	id: EdgeId;
	from: NodeId;
	to: NodeId;
	start: Point;
	end: Point;
	/** Cubic bezier control points. */
	control: readonly [Point, Point];
	/** SVG path data for the same curve. */
	path: string;
}

export interface LayoutResult {
	size: Size;
	nodes: Record<NodeId, NodeLayout>;
	edges: Record<EdgeId, EdgeLayout>;
	orientation: Orientation;
}
