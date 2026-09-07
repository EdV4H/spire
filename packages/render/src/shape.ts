/**
 * The drawing vocabulary shared by every backend.
 *
 * A custom renderer returns `Shape[]` rather than React elements, and that is
 * the whole point: React and `renderToSVG` draw the *same* shapes, so a map with
 * custom node art still produces a share image that matches the screen. The
 * older `renderNode` prop returns JSX and therefore only ever worked in React —
 * it is still there as an escape hatch, and it is still the one way to make the
 * two disagree.
 *
 * Deliberately small. This is a description of marks on a canvas, not an
 * embedding of SVG: anything expressible only as raw SVG markup belongs in the
 * React escape hatch, where the trade-off is explicit.
 */

export interface Paint {
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	/** 0-1. */
	opacity?: number;
	/** Dash pattern in px, e.g. `[4, 6]`. */
	dash?: readonly number[];
	linecap?: "butt" | "round" | "square";
	linejoin?: "miter" | "round" | "bevel";
}

export interface CircleShape extends Paint {
	shape: "circle";
	/** Defaults to 0 — node renderers draw around the node's centre. */
	cx?: number;
	cy?: number;
	r: number;
}

export interface RectShape extends Paint {
	shape: "rect";
	x: number;
	y: number;
	width: number;
	height: number;
	/** Corner radius. */
	rx?: number;
}

export interface PathShape extends Paint {
	shape: "path";
	/** An SVG path `d` string. */
	d: string;
}

export interface LineShape extends Paint {
	shape: "line";
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface PolygonShape extends Paint {
	shape: "polygon";
	points: readonly (readonly [number, number])[];
}

export interface TextShape extends Paint {
	shape: "text";
	text: string;
	x?: number;
	y?: number;
	fontSize?: number;
	fontWeight?: number | "normal" | "bold";
	fontFamily?: string;
	anchor?: "start" | "middle" | "end";
	baseline?: "auto" | "middle" | "hanging";
}

/**
 * A transform, described rather than spelled.
 *
 * It was an SVG transform *string* until a second backend existed, at which
 * point the leak was obvious: `"translate(4 -8) rotate(45)"` is SVG's syntax,
 * and a canvas backend would have had to parse it — the drawing vocabulary
 * would have been SVG's vocabulary wearing a different name. Described this
 * way, each backend applies it in its own terms.
 *
 * Applied in the order named here: translate, then rotate, then scale.
 */
export interface Transform {
	translate?: readonly [number, number];
	/** Degrees, clockwise. */
	rotate?: number;
	scale?: number;
}

export interface GroupShape {
	shape: "group";
	transform?: Transform;
	children: readonly Shape[];
}

export type Shape =
	| CircleShape
	| RectShape
	| PathShape
	| LineShape
	| PolygonShape
	| TextShape
	| GroupShape;

/**
 * Serialise one shape to SVG markup.
 *
 * Used by `renderToSVG`; the React backend walks the same union and emits
 * elements instead. Both are driven from this file so a new shape kind cannot
 * be added to one backend and forgotten in the other — the compiler's
 * exhaustiveness check on `Shape` catches it.
 */
export function shapeToSvg(shape: Shape): string {
	switch (shape.shape) {
		case "circle":
			// cx/cy default to 0 in SVG, and a node renderer draws around the origin,
			// so the common case emits neither.
			return `<circle${xy("cx", shape.cx)}${xy("cy", shape.cy)} r="${num(shape.r)}"${paint(shape)}/>`;
		case "rect":
			return (
				`<rect x="${num(shape.x)}" y="${num(shape.y)}"` +
				` width="${num(shape.width)}" height="${num(shape.height)}"` +
				(shape.rx === undefined ? "" : ` rx="${num(shape.rx)}"`) +
				`${paint(shape)}/>`
			);
		case "path":
			return `<path d="${attr(shape.d)}"${paint(shape)}/>`;
		case "line":
			return `<line x1="${num(shape.x1)}" y1="${num(shape.y1)}" x2="${num(shape.x2)}" y2="${num(shape.y2)}"${paint(shape)}/>`;
		case "polygon":
			return `<polygon points="${attr(shape.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" "))}"${paint(shape)}/>`;
		case "text":
			return (
				`<text${xy("x", shape.x)}${xy("y", shape.y)}` +
				(shape.fontSize === undefined ? "" : ` font-size="${num(shape.fontSize)}"`) +
				(shape.fontWeight === undefined ? "" : ` font-weight="${attr(String(shape.fontWeight))}"`) +
				(shape.fontFamily === undefined ? "" : ` font-family="${attr(shape.fontFamily)}"`) +
				(shape.anchor === undefined ? "" : ` text-anchor="${shape.anchor}"`) +
				(shape.baseline === undefined ? "" : ` dominant-baseline="${shape.baseline}"`) +
				`${paint(shape)}>${text(shape.text)}</text>`
			);
		case "group": {
			const transform = transformToSvg(shape.transform);
			return (
				`<g${transform === "" ? "" : ` transform="${transform}"`}>` +
				shape.children.map(shapeToSvg).join("") +
				"</g>"
			);
		}
	}
}

/** A `Transform` in SVG's spelling. Empty when there is nothing to apply. */
export function transformToSvg(transform: Transform | undefined): string {
	if (transform === undefined) return "";
	const parts: string[] = [];
	if (transform.translate !== undefined) {
		parts.push(`translate(${num(transform.translate[0])} ${num(transform.translate[1])})`);
	}
	if (transform.rotate !== undefined) parts.push(`rotate(${num(transform.rotate)})`);
	if (transform.scale !== undefined) parts.push(`scale(${num(transform.scale)})`);
	return parts.join(" ");
}

function paint(value: Paint): string {
	return (
		(value.fill === undefined ? "" : ` fill="${attr(value.fill)}"`) +
		(value.stroke === undefined ? "" : ` stroke="${attr(value.stroke)}"`) +
		(value.strokeWidth === undefined ? "" : ` stroke-width="${num(value.strokeWidth)}"`) +
		(value.opacity === undefined ? "" : ` opacity="${num(value.opacity)}"`) +
		(value.dash === undefined ? "" : ` stroke-dasharray="${value.dash.map(num).join(" ")}"`) +
		(value.linecap === undefined ? "" : ` stroke-linecap="${value.linecap}"`) +
		(value.linejoin === undefined ? "" : ` stroke-linejoin="${value.linejoin}"`)
	);
}

/** An origin-relative coordinate, omitted when it is the SVG default of 0. */
function xy(name: string, value: number | undefined): string {
	return value === undefined || value === 0 ? "" : ` ${name}="${num(value)}"`;
}

function num(value: number): number {
	return Math.round(value * 100) / 100;
}

function attr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function text(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
