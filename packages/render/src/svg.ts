import type { MapDocument, Spire, StateDocument } from "@edv4h/spire-core";
import { createDrawing } from "./drawing.js";
import { buildScene, type Scene, type SceneOptions } from "./scene.js";
import { shapeToSvg } from "./shape.js";

/**
 * Render a map to a standalone SVG string.
 *
 * Environment-independent: no DOM, no canvas, so this runs in a request handler
 * to produce a share image. It draws the same `Scene` the React component does,
 * so the image and the screen cannot drift apart.
 *
 * Decoration around the map — a team name, a day count, a logo — is the
 * application's, not the SDK's. Compose it around the returned string.
 */

export interface SvgOptions extends SceneOptions {
	/** Multiplies the layout's natural size. */
	scale?: number;
	/** Painted behind everything. Defaults to the theme's background, else none. */
	background?: string;
	/** Added to the root `<svg>` element. */
	className?: string;
	/** Accessible name. Omit for a decorative image. */
	title?: string;
	/**
	 * Supplies the renderer registries, so a theme's `renderer` ids resolve here
	 * exactly as they do in `<SpireMap>`. Without it the built-in look is drawn.
	 */
	spire?: Spire;
}

export function renderToSVG(
	map: MapDocument,
	state: StateDocument,
	options: SvgOptions = {},
): string {
	const scene = buildScene(map, state, options);
	const drawing = createDrawing(scene, {
		...(options.spire === undefined ? {} : { spire: options.spire }),
		...(options.theme === undefined ? {} : { theme: options.theme }),
	});
	const scale = options.scale ?? 1;
	const width = round(scene.size.width * scale);
	const height = round(scene.size.height * scale);
	const background = options.background ?? scene.background;

	const parts: string[] = [];

	if (options.title !== undefined) parts.push(`<title>${escapeText(options.title)}</title>`);
	if (background !== undefined) {
		parts.push(`<rect width="100%" height="100%" fill="${escapeAttr(background)}"/>`);
	}

	for (const shape of drawing.layer("background")) parts.push(shapeToSvg(shape));

	for (const edge of scene.edges) {
		parts.push(
			`<g data-spire-edge="${escapeAttr(edge.id)}">` +
				drawing.edge(edge).map(shapeToSvg).join("") +
				"</g>",
		);
	}

	// Each node's shapes are wrapped in a `<g>` translated to its centre, so a
	// renderer draws around the origin and does not have to know where it is.
	for (const node of scene.nodes) {
		parts.push(
			`<g transform="translate(${round(node.center.x)} ${round(node.center.y)})"` +
				` data-spire-node="${escapeAttr(node.id)}" data-spire-status="${node.status}">` +
				drawing.node(node).map(shapeToSvg).join("") +
				"</g>",
		);
	}

	for (const shape of drawing.layer("overlay")) parts.push(shapeToSvg(shape));

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(scene.size.width)} ${round(scene.size.height)}"` +
		` width="${width}" height="${height}"` +
		(options.className === undefined ? "" : ` class="${escapeAttr(options.className)}"`) +
		(options.title === undefined ? ' role="presentation"' : ' role="img"') +
		`>${parts.join("")}</svg>`
	);
}

/** The scene a given SVG was drawn from, for hosts that want the geometry too. */
export function sceneFor(
	map: MapDocument,
	state: StateDocument,
	options: SceneOptions = {},
): Scene {
	return buildScene(map, state, options);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
