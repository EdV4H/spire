import type { MapDocument, StateDocument } from "@edv4h/spire-core";
import { buildScene, type Scene, type SceneOptions } from "./scene.js";

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
}

export function renderToSVG(
	map: MapDocument,
	state: StateDocument,
	options: SvgOptions = {},
): string {
	const scene = buildScene(map, state, options);
	const scale = options.scale ?? 1;
	const width = round(scene.size.width * scale);
	const height = round(scene.size.height * scale);
	const background = options.background ?? scene.background;

	const parts: string[] = [];

	if (options.title !== undefined) parts.push(`<title>${escapeText(options.title)}</title>`);
	if (background !== undefined) {
		parts.push(`<rect width="100%" height="100%" fill="${escapeAttr(background)}"/>`);
	}

	for (const edge of scene.edges) {
		parts.push(
			`<path d="${escapeAttr(edge.path)}" fill="none" stroke="${escapeAttr(edge.stroke)}"` +
				` stroke-width="${edge.strokeWidth}" stroke-linecap="round"` +
				(edge.dash === undefined ? "" : ` stroke-dasharray="${edge.dash.join(" ")}"`) +
				` data-spire-edge="${escapeAttr(edge.id)}"/>`,
		);
	}

	for (const node of scene.nodes) {
		parts.push(
			`<circle cx="${round(node.center.x)}" cy="${round(node.center.y)}" r="${node.radius}"` +
				` fill="${escapeAttr(node.fill)}" stroke="${escapeAttr(node.stroke)}"` +
				` stroke-width="${node.strokeWidth}"` +
				(node.opacity === 1 ? "" : ` opacity="${node.opacity}"`) +
				` data-spire-node="${escapeAttr(node.id)}" data-spire-status="${node.status}"/>`,
		);
	}

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
