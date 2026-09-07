export type { BackendProps, RenderBackend } from "./backend.js";
export { SVG_BACKEND_ID } from "./backend.js";
export type { SpireMapProps, StaticRenderOptions } from "./contracts.js";
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
export { Shapes } from "./shape-react.js";
export { SpireMap } from "./spire-map.js";
export type { SvgOptions } from "./svg.js";
export { renderToSVG, sceneFor } from "./svg.js";
export { SvgBackend, svgBackend } from "./svg-backend.js";
export type { EdgeStyle, NodeStyle, SpireTheme, ThemeNodeStyles } from "./theme.js";
export { defaultTheme, resolveEdgeStyle, resolveNodeStyle } from "./theme.js";
