import {
	createRegistry,
	defineService,
	type PluginError,
	type Registry,
	type ServiceRegistry,
	type Spire,
} from "@edv4h/spire-core";
import type { RenderBackend } from "./backend.js";
import type { Scene, SceneEdge, SceneNode } from "./scene.js";
import type { Shape } from "./shape.js";
import type { SpireTheme } from "./theme.js";

/**
 * Rendering's extension points.
 *
 * Like generation's, they live here rather than on `PluginContext` — the kernel
 * has no business knowing what a node renderer is, and a headless host that
 * only validates maps should not carry drawing code. They reach plugins through
 * `ctx.services`.
 *
 * Everything is addressed by string id for the same reason it is in generation:
 * a theme is data, and `{ "boss": { "renderer": "boss-crown" } }` stays JSON.
 * A theme holding a draw *function* could not be stored or shipped to a server
 * that renders share images.
 *
 * A renderer is handed a `SceneNode`/`SceneEdge` — never the map document —
 * because the scene is the one place where layout, status and theme have
 * already been resolved. That is what keeps the React and SVG backends from
 * drifting apart, and a renderer reaching around it would reintroduce exactly
 * the divergence `buildScene` exists to prevent.
 */

export interface RenderContext {
	/** The theme the scene was built with, for a renderer that wants its palette. */
	readonly theme: SpireTheme;
	/** The whole scene, for a renderer that needs its neighbours or the size. */
	readonly scene: Scene;
}

export interface NodeRenderer {
	readonly id: string;
	/**
	 * Shapes for one node, drawn **around the origin** — the backend has already
	 * translated to the node's centre. Return an empty array to draw nothing.
	 */
	draw(node: SceneNode, ctx: RenderContext): readonly Shape[];
}

export interface EdgeRenderer {
	readonly id: string;
	/** Shapes for one edge, in scene coordinates. */
	draw(edge: SceneEdge, ctx: RenderContext): readonly Shape[];
}

export interface LayerRenderer {
	readonly id: string;
	/** `background` draws under the edges; `overlay` draws over the nodes. */
	readonly place: "background" | "overlay";
	/** Lower numbers draw first. Defaults to 0; ties keep registration order. */
	readonly order?: number;
	/** Shapes for the whole layer, in scene coordinates. */
	draw(ctx: RenderContext): readonly Shape[];
}

export interface RenderRegistries {
	nodeRenderers: Registry<NodeRenderer>;
	edgeRenderers: Registry<EdgeRenderer>;
	layers: Registry<LayerRenderer>;
	/** Drawing backends. `svg` is built in and is not registered here. */
	backends: Registry<RenderBackend>;
	conflicts(): readonly PluginError[];
}

export const renderService = defineService<RenderRegistries>("@edv4h/spire-render");

export interface InternalRenderRegistries extends RenderRegistries {
	scopedFor(pluginId: string): RenderRegistries;
}

export function createRenderRegistries(): InternalRenderRegistries {
	const nodeRenderers = createRegistry<NodeRenderer>("node renderer");
	const edgeRenderers = createRegistry<EdgeRenderer>("edge renderer");
	const layers = createRegistry<LayerRenderer>("layer renderer");
	const backends = createRegistry<RenderBackend>("render backend");

	const conflicts = (): readonly PluginError[] => [
		...nodeRenderers.conflicts(),
		...edgeRenderers.conflicts(),
		...layers.conflicts(),
		...backends.conflicts(),
	];

	return {
		nodeRenderers,
		edgeRenderers,
		layers,
		backends,
		conflicts,
		scopedFor: (pluginId) => ({
			nodeRenderers: nodeRenderers.scopedFor(pluginId),
			edgeRenderers: edgeRenderers.scopedFor(pluginId),
			layers: layers.scopedFor(pluginId),
			backends: backends.scopedFor(pluginId),
			conflicts,
		}),
	};
}

/** The render registries a `Spire` carries, or `undefined` if the plugin is absent. */
export function getRenderRegistries(spire: Spire | ServiceRegistry): RenderRegistries | undefined {
	const services = "services" in spire ? spire.services : spire;
	return renderService.get(services);
}
