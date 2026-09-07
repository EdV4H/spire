import type { EdgeRenderer, LayerRenderer, NodeRenderer, Shape } from "@edv4h/spire-render";

/**
 * Demonstration renderers.
 *
 * They exist to make the extension point touchable: switch one on and the map
 * changes shape, then press "SVG をコピー" and the copied image changes the same
 * way. That second half is the point of the whole design — a renderer returns
 * shapes, so both backends draw it.
 */

/** A node that shows its content: the title from `node.data`, or the type. */
export const labelRenderer: NodeRenderer = {
	id: "playground:label",
	draw: (node) => {
		const title = typeof node.data?.title === "string" ? node.data.title : node.type;
		return [
			{
				shape: "circle",
				r: node.radius,
				fill: node.fill,
				stroke: node.stroke,
				strokeWidth: node.strokeWidth,
				opacity: node.opacity,
			},
			{
				shape: "text",
				text: title,
				y: node.radius + 14,
				anchor: "middle",
				fontSize: 11,
				fill: "#3f3f46",
				opacity: node.opacity,
			},
		];
	},
};

/** A diamond instead of a circle, to show the shape itself is replaceable. */
export const diamondRenderer: NodeRenderer = {
	id: "playground:diamond",
	draw: (node) => {
		const r = node.radius * 1.2;
		return [
			{
				shape: "polygon",
				points: [
					[0, -r],
					[r, 0],
					[0, r],
					[-r, 0],
				],
				fill: node.fill,
				stroke: node.stroke,
				strokeWidth: node.strokeWidth,
				opacity: node.opacity,
				linejoin: "round",
			},
		];
	},
};

/** Completed edges get an arrowhead, so direction is visible on the route taken. */
export const arrowRenderer: EdgeRenderer = {
	id: "playground:arrow",
	draw: (edge) => {
		const line: Shape = {
			shape: "path",
			d: edge.path,
			fill: "none",
			stroke: edge.stroke,
			strokeWidth: edge.strokeWidth,
			linecap: "round",
			...(edge.dash === undefined ? {} : { dash: edge.dash }),
		};
		if (!edge.completed) return [line];

		// The tangent at the end of a cubic bezier runs from the last control
		// point to the end point, which is why SceneEdge carries them.
		const dx = edge.end.x - edge.control[1].x;
		const dy = edge.end.y - edge.control[1].y;
		const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

		return [
			line,
			{
				shape: "group",
				transform: { translate: [edge.end.x, edge.end.y], rotate: angle },
				children: [
					{
						shape: "polygon",
						points: [
							[-16, -5],
							[-6, 0],
							[-16, 5],
						],
						fill: edge.stroke,
						linejoin: "round",
					},
				],
			},
		];
	},
};

/**
 * A row guide under everything, to show that layers land behind the edges.
 *
 * Drawn at `anchor`, not `center`: `center` carries the theme's jitter, so
 * nodes in one row sit at different y values. Grouping by the drawn coordinate
 * put a line under every *node* instead of every row, and averaging them only
 * approximated the row — a row holding one node does not average at all.
 */
export const rowGuidesLayer: LayerRenderer = {
	id: "playground:row-guides",
	place: "background",
	draw: (ctx) => {
		const { width, height } = ctx.scene.size;
		// A row runs across the map, so which axis it spans follows orientation.
		const horizontal =
			ctx.scene.orientation === "left-right" || ctx.scene.orientation === "right-left";

		const at = new Set(ctx.scene.nodes.map((node) => (horizontal ? node.anchor.x : node.anchor.y)));

		return [...at].map((position) =>
			horizontal
				? {
						shape: "line",
						x1: position,
						y1: 0,
						x2: position,
						y2: height,
						stroke: "#eceef1",
						strokeWidth: 1,
					}
				: {
						shape: "line",
						x1: 0,
						y1: position,
						x2: width,
						y2: position,
						stroke: "#eceef1",
						strokeWidth: 1,
					},
		);
	},
};

/** A count of completed nodes, drawn over everything. */
export const progressOverlay: LayerRenderer = {
	id: "playground:progress",
	place: "overlay",
	draw: (ctx) => {
		const done = ctx.scene.nodes.filter((node) => node.status === "completed").length;
		return [
			{
				shape: "text",
				text: `${done} / ${ctx.scene.nodes.length}`,
				x: ctx.scene.size.width - 12,
				y: 20,
				anchor: "end",
				fontSize: 12,
				fill: "#9aa1ab",
			},
		];
	},
};

export const NODE_RENDERERS: readonly NodeRenderer[] = [labelRenderer, diamondRenderer];
export const EDGE_RENDERERS: readonly EdgeRenderer[] = [arrowRenderer];
export const LAYERS: readonly LayerRenderer[] = [rowGuidesLayer, progressOverlay];
