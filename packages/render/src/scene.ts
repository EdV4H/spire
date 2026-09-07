import {
	buildIndex,
	type EdgeId,
	getNodeStatus,
	type MapDocument,
	type NodeId,
	type NodeStatus,
	type NodeTypeId,
	type StateDocument,
} from "@edv4h/spire-core";
import { type LayoutOptions, layout, type Orientation, type Point } from "@edv4h/spire-layout";
import { defaultTheme, resolveEdgeStyle, resolveNodeStyle, type SpireTheme } from "./theme.js";

/**
 * The drawing model, one step before any actual drawing.
 *
 * `buildScene` resolves layout, status and theme into flat lists of shapes with
 * their final colours. The React component and `renderToSVG` both consume this
 * and nothing else, which is the whole reason it exists: a share image that does
 * not match what the user saw on screen is worse than no share image, and the
 * only way to guarantee they match is to have one function decide.
 *
 * Nothing here touches the DOM, so `renderToSVG` runs on a server.
 */

export interface SceneNode {
	id: NodeId;
	type: NodeTypeId;
	status: NodeStatus;
	center: Point;
	radius: number;
	fill: string;
	stroke: string;
	strokeWidth: number;
	opacity: number;
	/**
	 * The node's `data`, carried through untouched.
	 *
	 * Here so that a custom renderer can draw a label without reaching for the
	 * map document — reaching around the scene is what makes two backends
	 * disagree. The SDK never interprets it.
	 */
	data: Record<string, unknown> | undefined;
	/** Id of the `NodeRenderer` the theme asked for, if any. */
	renderer: string | undefined;
}

export interface SceneEdge {
	id: EdgeId;
	from: NodeId;
	to: NodeId;
	path: string;
	/**
	 * The bezier's own points, alongside the `path` string.
	 *
	 * A custom edge renderer needs these: an arrowhead has to sit at `end` and
	 * point along the tangent from `control[1]`, and there is no way back to that
	 * from a `d` string. The default renderer uses only `path`.
	 */
	start: Point;
	end: Point;
	control: readonly [Point, Point];
	stroke: string;
	strokeWidth: number;
	dash: readonly number[] | undefined;
	/** True when both endpoints are completed — the "path taken". */
	completed: boolean;
	/** Id of the `EdgeRenderer` the theme asked for, if any. */
	renderer: string | undefined;
}

export interface Scene {
	size: { width: number; height: number };
	orientation: Orientation;
	background: string | undefined;
	/** Back to front: edges first, then nodes. */
	edges: SceneEdge[];
	nodes: SceneNode[];
}

export interface SceneOptions {
	theme?: SpireTheme;
	orientation?: Orientation;
	/** Overrides the theme's spacing. */
	spacing?: { col: number; row: number };
	/** Overrides the theme's jitter amount. */
	jitter?: { amount: number; seed?: number };
	padding?: number;
	curvature?: number;
}

export function buildScene(
	map: MapDocument,
	state: StateDocument,
	options: SceneOptions = {},
): Scene {
	const theme = options.theme ?? defaultTheme;
	const jitter: { amount: number; seed?: number } = options.jitter ?? theme.jitter;

	const layoutOptions: LayoutOptions = {
		...(options.orientation === undefined ? {} : { orientation: options.orientation }),
		spacing: options.spacing ?? theme.spacing,
		jitter: { amount: jitter.amount, ...(jitter.seed === undefined ? {} : { seed: jitter.seed }) },
		...(options.padding === undefined ? {} : { padding: options.padding }),
		...(options.curvature === undefined ? {} : { curvature: options.curvature }),
	};

	const placed = layout(map, layoutOptions);
	const index = buildIndex(map);

	const statuses = new Map<NodeId, NodeStatus>();
	for (const node of map.nodes) {
		statuses.set(node.id, getNodeStatus(map, state, node.id, index));
	}

	const edges: SceneEdge[] = [];
	for (const edge of map.edges) {
		const geometry = placed.edges[edge.id];
		if (geometry === undefined) continue;

		const completed =
			statuses.get(edge.from) === "completed" && statuses.get(edge.to) === "completed";
		const style = resolveEdgeStyle(theme, completed);

		edges.push({
			id: edge.id,
			from: edge.from,
			to: edge.to,
			path: geometry.path,
			start: geometry.start,
			end: geometry.end,
			control: geometry.control,
			stroke: style.stroke,
			strokeWidth: style.strokeWidth,
			dash: style.dash,
			completed,
			renderer: style.renderer,
		});
	}

	const nodes: SceneNode[] = [];
	for (const node of map.nodes) {
		const geometry = placed.nodes[node.id];
		if (geometry === undefined) continue;

		const status = statuses.get(node.id) ?? "locked";
		const style = resolveNodeStyle(theme, node.type, status);

		nodes.push({
			id: node.id,
			type: node.type,
			status,
			center: geometry.center,
			radius: style.size,
			fill: style.fill,
			stroke: style.stroke,
			strokeWidth: style.strokeWidth,
			opacity: style.opacity ?? 1,
			data: node.data,
			renderer: style.renderer,
		});
	}

	return {
		size: placed.size,
		orientation: placed.orientation,
		background: theme.background,
		edges,
		nodes,
	};
}

/** Node statuses keyed by id — what `onNodeStatusChange` diffs against. */
export function statusMap(map: MapDocument, state: StateDocument): Map<NodeId, NodeStatus> {
	const index = buildIndex(map);
	const statuses = new Map<NodeId, NodeStatus>();
	for (const node of map.nodes) {
		statuses.set(node.id, getNodeStatus(map, state, node.id, index));
	}
	return statuses;
}
