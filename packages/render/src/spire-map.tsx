import type { NodeId, NodeStatus } from "@edv4h/spire-core";
import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { SVG_BACKEND_ID } from "./backend.js";
import type { SpireMapProps } from "./contracts.js";
import { createDrawing } from "./drawing.js";
import { getRenderRegistries } from "./registries.js";
import { buildScene } from "./scene.js";
import { svgBackend } from "./svg-backend.js";

/**
 * The React renderer.
 *
 * It builds the scene, resolves it to shapes, and hands both to a backend —
 * SVG unless a host names another. Everything above the backend is shared, so
 * two backends cannot disagree about where a node is or what colour it is; the
 * only thing a backend decides is how the shapes reach the screen.
 *
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
		scale = 1,
		spire,
		backend: backendId = SVG_BACKEND_ID,
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

	const drawing = useMemo(
		() =>
			createDrawing(scene, {
				...(spire === undefined ? {} : { spire }),
				...(theme === undefined ? {} : { theme }),
			}),
		[scene, spire, theme],
	);

	// An unregistered backend id falls back to SVG rather than rendering nothing,
	// for the same reason an unregistered node renderer does: configuration
	// naming something the host forgot to load should degrade, not blank.
	const backend = useMemo(() => {
		if (backendId === SVG_BACKEND_ID || spire === undefined) return svgBackend;
		return getRenderRegistries(spire)?.backends.get(backendId) ?? svgBackend;
	}, [backendId, spire]);

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
	//
	// It works from the scene's own coordinates rather than by finding the
	// node's element, so it behaves identically on a backend that has no element
	// per node.
	const rootRef = useRef<HTMLDivElement | null>(null);
	// The scene and scale are read through a ref so that the effect depends on
	// `focusNodeId` alone: focusing must happen when the host asks for a node,
	// not every time the map re-renders under the same focus.
	const latest = useRef({ scene, scale });
	latest.current = { scene, scale };
	useEffect(() => {
		if (focusNodeId === undefined) return;
		const root = rootRef.current?.firstElementChild ?? null;
		if (root === null) return;

		const { scene: current, scale: currentScale } = latest.current;
		const node = current.nodes.find((candidate) => candidate.id === focusNodeId);
		if (node === undefined) return;

		const container = nearestScrollContainer(root);
		if (container === null) return;

		const box = root.getBoundingClientRect();
		const containerBox = container.getBoundingClientRect();
		const originLeft = container.scrollLeft + (box.left - containerBox.left);
		const originTop = container.scrollTop + (box.top - containerBox.top);

		container.scrollTo({
			left: originLeft + node.center.x * currentScale - container.clientWidth / 2,
			top: originTop + node.center.y * currentScale - container.clientHeight / 2,
			behavior: prefersReducedMotion() ? "auto" : "smooth",
		});
	}, [focusNodeId]);

	// `renderNode` reaches the backend keyed by node id, so a backend that cannot
	// build a React tree per node can ignore it without knowing about the map.
	const renderNodeById = useMemo(() => {
		if (renderNode === undefined) return undefined;
		return (nodeId: NodeId, status: NodeStatus): ReactElement | undefined => {
			const node = map.nodes.find((candidate) => candidate.id === nodeId);
			if (node === undefined) return undefined;
			return renderNode(node, status) ?? undefined;
		};
	}, [renderNode, map]);

	const Backend = backend.Component;

	// `display: contents` so the wrapper adds no box of its own: it exists only
	// as a stable handle on whatever the backend rendered.
	return (
		<div ref={rootRef} style={{ display: "contents" }}>
			<Backend
				scene={scene}
				drawing={drawing}
				scale={scale}
				title={title}
				className={className}
				onNodePress={onNodePress}
				renderNode={renderNodeById}
			/>
		</div>
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
