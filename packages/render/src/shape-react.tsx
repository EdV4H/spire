import { Fragment, type ReactElement } from "react";
import type { Paint, Shape } from "./shape.js";

/**
 * The React half of the shape vocabulary.
 *
 * Mirrors `shapeToSvg` exactly. The two are kept in one place each rather than
 * one place total because React wants elements and the string renderer wants
 * markup — but they walk the same `Shape` union, so the compiler refuses to let
 * a new shape kind exist in only one of them.
 */
export function Shapes({ shapes }: { shapes: readonly Shape[] }): ReactElement {
	return (
		<>
			{shapes.map((shape, index) => (
				// Shapes are a positional list produced fresh on every render; there
				// is no stable identity to key on and no state to preserve.
				// biome-ignore lint/suspicious/noArrayIndexKey: positional list with no identity of its own
				<Fragment key={index}>{shapeElement(shape)}</Fragment>
			))}
		</>
	);
}

function shapeElement(shape: Shape): ReactElement {
	switch (shape.shape) {
		case "circle":
			return <circle cx={shape.cx ?? 0} cy={shape.cy ?? 0} r={shape.r} {...paint(shape)} />;
		case "rect":
			return (
				<rect
					x={shape.x}
					y={shape.y}
					width={shape.width}
					height={shape.height}
					{...(shape.rx === undefined ? {} : { rx: shape.rx })}
					{...paint(shape)}
				/>
			);
		case "path":
			return <path d={shape.d} {...paint(shape)} />;
		case "line":
			return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...paint(shape)} />;
		case "polygon":
			return (
				<polygon points={shape.points.map(([x, y]) => `${x},${y}`).join(" ")} {...paint(shape)} />
			);
		case "text":
			return (
				<text
					x={shape.x ?? 0}
					y={shape.y ?? 0}
					{...(shape.fontSize === undefined ? {} : { fontSize: shape.fontSize })}
					{...(shape.fontWeight === undefined ? {} : { fontWeight: shape.fontWeight })}
					{...(shape.fontFamily === undefined ? {} : { fontFamily: shape.fontFamily })}
					{...(shape.anchor === undefined ? {} : { textAnchor: shape.anchor })}
					{...(shape.baseline === undefined ? {} : { dominantBaseline: shape.baseline })}
					{...paint(shape)}
				>
					{shape.text}
				</text>
			);
		case "group":
			return (
				<g {...(shape.transform === undefined ? {} : { transform: shape.transform })}>
					<Shapes shapes={shape.children} />
				</g>
			);
	}
}

/** Paint properties in React's spelling. Absent stays absent, so SVG defaults apply. */
function paint(value: Paint): Record<string, unknown> {
	return {
		...(value.fill === undefined ? {} : { fill: value.fill }),
		...(value.stroke === undefined ? {} : { stroke: value.stroke }),
		...(value.strokeWidth === undefined ? {} : { strokeWidth: value.strokeWidth }),
		...(value.opacity === undefined ? {} : { opacity: value.opacity }),
		...(value.dash === undefined ? {} : { strokeDasharray: value.dash.join(" ") }),
		...(value.linecap === undefined ? {} : { strokeLinecap: value.linecap }),
		...(value.linejoin === undefined ? {} : { strokeLinejoin: value.linejoin }),
	};
}
