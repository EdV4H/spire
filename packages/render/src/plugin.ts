import { SPIRE_PLUGIN_API_VERSION, type SpirePlugin } from "@edv4h/spire-core";
import type { RenderBackend } from "./backend.js";
import {
	createRenderRegistries,
	type EdgeRenderer,
	type LayerRenderer,
	type NodeRenderer,
	renderService,
} from "./registries.js";

export const RENDER_PLUGIN_ID = "@edv4h/spire-render";

export interface RenderPluginOptions {
	nodeRenderers?: readonly NodeRenderer[];
	edgeRenderers?: readonly EdgeRenderer[];
	layers?: readonly LayerRenderer[];
	backends?: readonly RenderBackend[];
}

/**
 * Registers rendering's three registries, and any renderers given up front.
 *
 * Rendering is a plugin for the same reason generation is: a host that stores
 * and validates maps without drawing them should not carry drawing code, and a
 * host that wants different node art registers a renderer rather than forking
 * the component.
 *
 * There are no built-in entries. The default look is not a registered renderer
 * — it is the fallback in `createDrawing` — and the SVG backend is not a
 * registered backend, so a map draws correctly with no plugins loaded at all.
 */
export function createRenderPlugin(options: RenderPluginOptions = {}): SpirePlugin {
	return {
		id: RENDER_PLUGIN_ID,
		name: "Spire rendering",
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		setup(ctx) {
			const registries = createRenderRegistries();

			for (const renderer of options.nodeRenderers ?? []) {
				registries.nodeRenderers.register(renderer);
			}
			for (const renderer of options.edgeRenderers ?? []) {
				registries.edgeRenderers.register(renderer);
			}
			for (const layer of options.layers ?? []) registries.layers.register(layer);
			for (const backend of options.backends ?? []) registries.backends.register(backend);

			return renderService.provide(ctx.services, registries);
		},
	};
}
