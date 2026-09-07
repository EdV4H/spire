import type { ReactElement } from "react";
import type { BackendProps, RenderBackend } from "./backend.js";
import { SVG_BACKEND_ID } from "./backend.js";
import { Shapes } from "./shape-react.js";

/**
 * The built-in backend: one SVG element per shape.
 *
 * Every node is its own focusable element with a real keyboard contract, which
 * is why this is the default and why it stays the default. A canvas draws the
 * same picture faster and cannot do that.
 */
export function SvgBackend({
	scene,
	drawing,
	scale,
	title,
	className,
	onNodePress,
	renderNode,
}: BackendProps): ReactElement {
	return (
		<svg
			className={className}
			viewBox={`0 0 ${scene.size.width} ${scene.size.height}`}
			width={round(scene.size.width * scale)}
			height={round(scene.size.height * scale)}
			role={onNodePress === undefined ? "img" : "group"}
			style={scene.background === undefined ? undefined : { background: scene.background }}
			data-spire-backend={SVG_BACKEND_ID}
		>
			<title>{title}</title>
			<Shapes shapes={drawing.layer("background")} />

			{scene.edges.map((edge) => (
				<g key={edge.id} data-spire-edge={edge.id}>
					<Shapes shapes={drawing.edge(edge)} />
				</g>
			))}

			{scene.nodes.map((node) => {
				// The React-only escape hatch wins when it returns something. It is
				// the one way to draw something `renderToSVG` cannot reproduce, which
				// is why the shape-returning renderers are the documented route.
				const custom = renderNode?.(node.id, node.status);
				const shape = custom ?? <Shapes shapes={drawing.node(node)} />;
				const transform = `translate(${node.center.x} ${node.center.y})`;

				// Two branches rather than conditional props: a node is either an
				// operable control with the full keyboard contract, or inert
				// decoration. Half of each is what produces unreachable buttons.
				if (onNodePress === undefined) {
					return (
						<g
							key={node.id}
							data-spire-node={node.id}
							data-spire-status={node.status}
							transform={transform}
						>
							{shape}
						</g>
					);
				}

				return (
					// biome-ignore lint/a11y/useSemanticElements: SVG has no <button> element, so role plus tabIndex and key handling is the contract.
					<g
						key={node.id}
						data-spire-node={node.id}
						data-spire-status={node.status}
						transform={transform}
						role="button"
						tabIndex={0}
						aria-label={`${node.type} (${node.status})`}
						style={{ cursor: "pointer" }}
						onClick={() => onNodePress(node.id)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onNodePress(node.id);
							}
						}}
					>
						{shape}
					</g>
				);
			})}

			<Shapes shapes={drawing.layer("overlay")} />
		</svg>
	);
}

export const svgBackend: RenderBackend = {
	id: SVG_BACKEND_ID,
	keyboardAccessible: true,
	Component: SvgBackend,
};

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
