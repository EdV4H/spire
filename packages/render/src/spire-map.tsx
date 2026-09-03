import type { NodeId, NodeStatus } from "@edv4h/spire-core";
import { type ReactElement, useEffect, useMemo, useRef } from "react";
import type { SpireMapProps } from "./contracts.js";
import { buildScene, type SceneNode } from "./scene.js";

/**
 * The React renderer.
 *
 * It draws the `Scene` and nothing else — the same scene `renderToSVG` draws.
 * Deliberately absent: animation. The component reports *when* a node's status
 * changed (`onNodeStatusChange`) and leaves *how* to celebrate it to the
 * application, because a completion flourish is a product decision and baking
 * one in would make every Spire map look like the same product.
 */
export function SpireMap(props: SpireMapProps): ReactElement {
	const {
		map,
		state,
		theme,
		orientation,
		spacing,
		jitter,
		padding,
		curvature,
		onNodePress,
		renderNode,
		onNodeStatusChange,
		focusNodeId,
		className,
		title = "Spire map",
	} = props;

	const scene = useMemo(
		() =>
			buildScene(map, state, {
				...(theme === undefined ? {} : { theme }),
				...(orientation === undefined ? {} : { orientation }),
				...(spacing === undefined ? {} : { spacing }),
				...(jitter === undefined ? {} : { jitter }),
				...(padding === undefined ? {} : { padding }),
				...(curvature === undefined ? {} : { curvature }),
			}),
		[map, state, theme, orientation, spacing, jitter, padding, curvature],
	);

	// Status changes are reported by diffing against the previous render, so a
	// host gets exactly one call per node that actually moved.
	const previous = useRef<Map<NodeId, NodeStatus> | undefined>(undefined);
	useEffect(() => {
		const current = new Map(scene.nodes.map((node) => [node.id, node.status]));
		const before = previous.current;
		previous.current = current;

		if (before === undefined || onNodeStatusChange === undefined) return;
		for (const [nodeId, to] of current) {
			const from = before.get(nodeId);
			if (from !== undefined && from !== to) onNodeStatusChange({ nodeId, from, to });
		}
	}, [scene, onNodeStatusChange]);

	// Auto-focus: centre the named node whenever it changes. Long maps are the
	// normal case, so landing the viewer on "where am I" matters more than it
	// would for a diagram.
	//
	// This scrolls the map's own scroll container and nothing else. The obvious
	// implementation, `element.scrollIntoView`, walks up and scrolls *every*
	// scrollable ancestor including the document, so focusing a node inside an
	// embedded map yanks the whole page — the map is a component on someone
	// else's page, and it has no business moving that page.
	const rootRef = useRef<SVGSVGElement | null>(null);
	useEffect(() => {
		if (focusNodeId === undefined) return;
		const root = rootRef.current;
		if (root === null) return;

		const target = root.querySelector(`[data-spire-node="${CSS.escape(focusNodeId)}"]`);
		if (target === null) return;

		const container = nearestScrollContainer(root);
		if (container === null) return;

		const targetBox = target.getBoundingClientRect();
		const containerBox = container.getBoundingClientRect();

		const left =
			container.scrollLeft +
			(targetBox.left - containerBox.left) -
			(container.clientWidth - targetBox.width) / 2;
		const top =
			container.scrollTop +
			(targetBox.top - containerBox.top) -
			(container.clientHeight - targetBox.height) / 2;

		container.scrollTo({ left, top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
	}, [focusNodeId]);

	return (
		<svg
			ref={rootRef}
			className={className}
			viewBox={`0 0 ${scene.size.width} ${scene.size.height}`}
			width={scene.size.width}
			height={scene.size.height}
			role={onNodePress === undefined ? "img" : "group"}
			style={scene.background === undefined ? undefined : { background: scene.background }}
		>
			<title>{title}</title>
			{scene.edges.map((edge) => (
				<path
					key={edge.id}
					d={edge.path}
					fill="none"
					stroke={edge.stroke}
					strokeWidth={edge.strokeWidth}
					strokeLinecap="round"
					strokeDasharray={edge.dash === undefined ? undefined : edge.dash.join(" ")}
					data-spire-edge={edge.id}
				/>
			))}

			{scene.nodes.map((node) => {
				const custom = renderNode?.(nodeOf(props, node.id), node.status);
				const shape = custom === undefined || custom === null ? defaultNode(node) : custom;
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
		</svg>
	);
}

function defaultNode(node: SceneNode): ReactElement {
	return (
		<circle
			r={node.radius}
			fill={node.fill}
			stroke={node.stroke}
			strokeWidth={node.strokeWidth}
			opacity={node.opacity}
		/>
	);
}

/**
 * The closest ancestor that actually scrolls. Returns `null` when the map is
 * not inside one — in which case focusing does nothing, which is the right
 * answer: there is no viewport of the map's own to move.
 */
function nearestScrollContainer(from: Element): Element | null {
	let node = from.parentElement;
	while (node !== null) {
		const style = getComputedStyle(node);
		// The shorthand is read alongside the longhands: not every environment
		// expands `overflow: auto` into `overflowX`/`overflowY`.
		const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
		const scrolls = /(auto|scroll|overlay)/.test(overflow);
		if (scrolls && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) {
			return node;
		}
		node = node.parentElement;
	}
	return null;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
	);
}

function nodeOf(props: SpireMapProps, nodeId: NodeId) {
	const found = props.map.nodes.find((node) => node.id === nodeId);
	if (found === undefined)
		throw new Error(`Scene referenced a node the map does not have: ${nodeId}`);
	return found;
}
