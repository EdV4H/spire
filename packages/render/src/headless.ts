/**
 * Everything that draws without React.
 *
 * The main entry re-exports `SpireMap`, so importing it pulls in `react` even
 * for code that only ever calls `renderToSVG`. That is wrong for the case the
 * shape vocabulary was built for: a server rendering share images has no React
 * tree, and should not have to install one to draw a map.
 *
 * So this entry exists, and it is not a smaller convenience build — it is the
 * whole module graph minus the three files that import React. Everything here
 * is also exported from the main entry, at the same identity.
 */

export type { RenderBackend } from "./backend.js";
export { SVG_BACKEND_ID } from "./backend.js";
export type { StaticRenderOptions } from "./contracts.js";
export type { Drawing, DrawingOptions } from "./drawing.js";
export { createDrawing, defaultEdgeShapes, defaultNodeShapes } from "./drawing.js";
export type { RenderPluginOptions } from "./plugin.js";
export { createRenderPlugin, RENDER_PLUGIN_ID } from "./plugin.js";
export type {
	EdgeRenderer,
	LayerRenderer,
	NodeRenderer,
	RenderContext,
	RenderRegistries,
} from "./registries.js";
export { createRenderRegistries, getRenderRegistries, renderService } from "./registries.js";
export type { Scene, SceneEdge, SceneNode, SceneOptions } from "./scene.js";
export { buildScene, statusMap } from "./scene.js";
export type {
	CircleShape,
	GroupShape,
	LineShape,
	Paint,
	PathShape,
	PolygonShape,
	RectShape,
	Shape,
	TextShape,
	Transform,
} from "./shape.js";
export { shapeToSvg, transformToSvg } from "./shape.js";
export type { SvgOptions } from "./svg.js";
export { renderToSVG, sceneFor } from "./svg.js";
export type { EdgeStyle, NodeStyle, SpireTheme, ThemeNodeStyles } from "./theme.js";
export { defaultTheme, resolveEdgeStyle, resolveNodeStyle } from "./theme.js";
