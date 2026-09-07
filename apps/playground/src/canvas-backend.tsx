import type { BackendProps, RenderBackend, Scene, Shape } from "@edv4h/spire-render";
import { type ReactElement, useCallback, useEffect, useRef } from "react";

/**
 * A canvas backend, written entirely against the public API.
 *
 * It lives in the playground rather than in the SDK on purpose: if a host can
 * write a backend with nothing but `@edv4h/spire-render`'s exports, the seam is
 * real. It is also the proof that `Scene → Shape[]` is genuinely
 * backend-independent — no SVG anywhere below.
 *
 * What it buys: one DOM element instead of one per node and edge. On a map with
 * a few thousand nodes that is the whole cost.
 *
 * What it costs: **keyboard access**. A canvas is a single element, so there is
 * nothing for a screen reader to land on and nothing to Tab to. Clicking works
 * by hit-testing. This is why `svg` stays the default and why `RenderBackend`
 * records `keyboardAccessible` — the trade-off should be visible at the point
 * of choosing, not discovered afterwards.
 */
function CanvasBackend({
	scene,
	drawing,
	scale,
	title,
	className,
	onNodePress,
}: BackendProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (canvas === null || ctx === null || ctx === undefined) return;

		// Backing store in device pixels, CSS box in layout pixels: without this
		// the drawing is soft on every retina display.
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.ceil(scene.size.width * scale * dpr);
		canvas.height = Math.ceil(scene.size.height * scale * dpr);

		ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
		ctx.clearRect(0, 0, scene.size.width, scene.size.height);

		if (scene.background !== undefined) {
			ctx.fillStyle = scene.background;
			ctx.fillRect(0, 0, scene.size.width, scene.size.height);
		}

		// The same order the SVG backend uses, for the same reason: painters'
		// order is part of what the scene means.
		paint(ctx, drawing.layer("background"));
		for (const edge of scene.edges) paint(ctx, drawing.edge(edge));
		for (const node of scene.nodes) {
			ctx.save();
			ctx.translate(node.center.x, node.center.y);
			paint(ctx, drawing.node(node));
			ctx.restore();
		}
		paint(ctx, drawing.layer("overlay"));
	}, [scene, drawing, scale]);

	// Hit testing replaces the per-node elements the SVG backend gets for free.
	// Nearest centre within its own radius, searched back to front so the node
	// drawn on top is the one that answers.
	const onClick = useCallback(
		(event: React.MouseEvent<HTMLCanvasElement>) => {
			if (onNodePress === undefined) return;
			const canvas = event.currentTarget;
			const box = canvas.getBoundingClientRect();
			const x = (event.clientX - box.left) / scale;
			const y = (event.clientY - box.top) / scale;

			for (let i = scene.nodes.length - 1; i >= 0; i--) {
				const node = scene.nodes[i];
				if (node === undefined) continue;
				const dx = x - node.center.x;
				const dy = y - node.center.y;
				// A little generous: a finger is bigger than a 13px circle.
				const reach = node.radius + 4;
				if (dx * dx + dy * dy <= reach * reach) {
					onNodePress(node.id);
					return;
				}
			}
		},
		[onNodePress, scene, scale],
	);

	// A canvas has no per-node element to hang a role on, which is exactly the
	// cost this backend trades away. `keyboardAccessible: false` records it.
	return (
		<canvas
			ref={canvasRef}
			className={className}
			aria-label={title}
			data-spire-backend="canvas"
			style={{
				width: `${scene.size.width * scale}px`,
				height: `${scene.size.height * scale}px`,
				display: "block",
				...(onNodePress === undefined ? {} : { cursor: "pointer" }),
			}}
			onClick={onClick}
		/>
	);
}

/** Draw a shape list. The whole backend-specific part of a backend. */
function paint(ctx: CanvasRenderingContext2D, shapes: readonly Shape[]): void {
	for (const shape of shapes) {
		ctx.save();
		applyPaint(ctx, shape);

		switch (shape.shape) {
			case "circle":
				ctx.beginPath();
				ctx.arc(shape.cx ?? 0, shape.cy ?? 0, shape.r, 0, Math.PI * 2);
				fillAndStroke(ctx, shape);
				break;
			case "rect":
				ctx.beginPath();
				if (shape.rx === undefined) {
					ctx.rect(shape.x, shape.y, shape.width, shape.height);
				} else {
					ctx.roundRect(shape.x, shape.y, shape.width, shape.height, shape.rx);
				}
				fillAndStroke(ctx, shape);
				break;
			case "path": {
				const path = new Path2D(shape.d);
				if (shape.fill !== undefined && shape.fill !== "none") ctx.fill(path);
				if (shape.stroke !== undefined) ctx.stroke(path);
				break;
			}
			case "line":
				ctx.beginPath();
				ctx.moveTo(shape.x1, shape.y1);
				ctx.lineTo(shape.x2, shape.y2);
				if (shape.stroke !== undefined) ctx.stroke();
				break;
			case "polygon": {
				ctx.beginPath();
				shape.points.forEach(([x, y], index) => {
					if (index === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				});
				ctx.closePath();
				fillAndStroke(ctx, shape);
				break;
			}
			case "text":
				ctx.font = `${shape.fontWeight ?? "normal"} ${shape.fontSize ?? 12}px ${shape.fontFamily ?? "system-ui, sans-serif"}`;
				ctx.textAlign = shape.anchor === undefined ? "start" : anchorOf(shape.anchor);
				ctx.textBaseline = shape.baseline === "middle" ? "middle" : "alphabetic";
				ctx.fillStyle = shape.fill ?? "#000";
				ctx.fillText(shape.text, shape.x ?? 0, shape.y ?? 0);
				break;
			case "group": {
				const transform = shape.transform;
				if (transform?.translate !== undefined) {
					ctx.translate(transform.translate[0], transform.translate[1]);
				}
				if (transform?.rotate !== undefined) ctx.rotate((transform.rotate * Math.PI) / 180);
				if (transform?.scale !== undefined) ctx.scale(transform.scale, transform.scale);
				paint(ctx, shape.children);
				break;
			}
		}

		ctx.restore();
	}
}

function applyPaint(ctx: CanvasRenderingContext2D, shape: Shape): void {
	if (shape.shape === "group") return;
	ctx.globalAlpha = shape.opacity ?? 1;
	if (shape.fill !== undefined && shape.fill !== "none") ctx.fillStyle = shape.fill;
	if (shape.stroke !== undefined) ctx.strokeStyle = shape.stroke;
	ctx.lineWidth = shape.strokeWidth ?? 1;
	ctx.lineCap = shape.linecap ?? "butt";
	ctx.lineJoin = shape.linejoin ?? "miter";
	ctx.setLineDash(shape.dash === undefined ? [] : [...shape.dash]);
}

function fillAndStroke(
	ctx: CanvasRenderingContext2D,
	shape: { fill?: string; stroke?: string },
): void {
	if (shape.fill !== undefined && shape.fill !== "none") ctx.fill();
	if (shape.stroke !== undefined) ctx.stroke();
}

function anchorOf(anchor: "start" | "middle" | "end"): CanvasTextAlign {
	return anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
}

export const canvasBackend: RenderBackend = {
	id: "playground:canvas",
	keyboardAccessible: false,
	Component: CanvasBackend,
};

/** How many shapes a scene comes to — the number that decides SVG's DOM cost. */
export function shapeCount(scene: Scene): number {
	return scene.nodes.length + scene.edges.length;
}
