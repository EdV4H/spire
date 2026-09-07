import type { Spire } from "@edv4h/spire-core";
import {
	getRenderRegistries,
	type LayerRenderer,
	type RenderContext,
	type RenderRegistries,
} from "./registries.js";
import type { Scene, SceneEdge, SceneNode } from "./scene.js";
import type { Shape } from "./shape.js";
import { defaultTheme, type SpireTheme } from "./theme.js";

/**
 * Turns a scene into shapes, resolving each node's and edge's renderer id.
 *
 * Both backends call this and neither decides anything else, so a custom
 * renderer draws identically on screen and in a share image. That is the reason
 * a renderer returns `Shape[]` and not JSX.
 *
 * The built-in look is expressed here as shapes too, rather than as a separate
 * code path in each backend: the default and the custom route are then the same
 * route, and a bug in one is a bug in both.
 */

export interface Drawing {
	node(node: SceneNode): readonly Shape[];
	edge(edge: SceneEdge): readonly Shape[];
	/** Layers for one placement, already ordered. */
	layer(place: "background" | "overlay"): readonly Shape[];
}

export interface DrawingOptions {
	/** Supplies the renderer registries. Without it, only the built-in look is used. */
	spire?: Spire;
	/** The theme the scene was built with, handed to renderers. */
	theme?: SpireTheme;
}

export function createDrawing(scene: Scene, options: DrawingOptions = {}): Drawing {
	const registries: RenderRegistries | undefined =
		options.spire === undefined ? undefined : getRenderRegistries(options.spire);

	const ctx: RenderContext = { theme: options.theme ?? defaultTheme, scene };

	return {
		node(node) {
			const custom =
				node.renderer === undefined ? undefined : registries?.nodeRenderers.get(node.renderer);
			// An unregistered id draws the default rather than nothing. A theme
			// naming a renderer the host forgot to load should look plain, not
			// blank the map.
			return custom === undefined ? defaultNodeShapes(node) : custom.draw(node, ctx);
		},

		edge(edge) {
			const custom =
				edge.renderer === undefined ? undefined : registries?.edgeRenderers.get(edge.renderer);
			return custom === undefined ? defaultEdgeShapes(edge) : custom.draw(edge, ctx);
		},

		layer(place) {
			// `getAll` hands back a Map in registration order, which is the tiebreak
			// the stable sort below preserves.
			const all = [...(registries?.layers.getAll().values() ?? [])];
			const allowed = ctx.theme.layers;
			return all
				.filter((layer) => layer.place === place)
				.filter((layer) => allowed === undefined || allowed.includes(layer.id))
				.sort(byOrder)
				.flatMap((layer) => layer.draw(ctx));
		},
	};
}

/** Stable: equal orders keep registration order, so a theme's layering is predictable. */
function byOrder(a: LayerRenderer, b: LayerRenderer): number {
	return (a.order ?? 0) - (b.order ?? 0);
}

/** The built-in node: one circle, centred on the origin. */
export function defaultNodeShapes(node: SceneNode): readonly Shape[] {
	return [
		{
			shape: "circle",
			r: node.radius,
			fill: node.fill,
			stroke: node.stroke,
			strokeWidth: node.strokeWidth,
			...(node.opacity === 1 ? {} : { opacity: node.opacity }),
		},
	];
}

/** The built-in edge: the layout's bezier. */
export function defaultEdgeShapes(edge: SceneEdge): readonly Shape[] {
	return [
		{
			shape: "path",
			d: edge.path,
			fill: "none",
			stroke: edge.stroke,
			strokeWidth: edge.strokeWidth,
			linecap: "round",
			...(edge.dash === undefined ? {} : { dash: edge.dash }),
		},
	];
}
