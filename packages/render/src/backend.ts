import type { NodeId, NodeStatus } from "@edv4h/spire-core";
import type { ComponentType, ReactElement } from "react";
import type { Drawing } from "./drawing.js";
import type { Scene } from "./scene.js";

/**
 * A drawing backend: what actually puts the shapes on screen.
 *
 * `Scene` → `Shape[]` is already backend-independent — that is what the shape
 * vocabulary bought — so a backend is only the last step. SVG is built in and
 * is the default; a canvas or WebGL backend exists because a few thousand nodes
 * means a few thousand DOM elements, and at that size the DOM is the cost.
 *
 * Backends are registered and chosen by id like everything else, so which one
 * draws is a host's configuration rather than a different import.
 */
export interface BackendProps {
	scene: Scene;
	/** Shapes for nodes, edges and layers, with renderer ids already resolved. */
	drawing: Drawing;
	/** Multiplies the drawn size. The scene's own coordinates are unscaled. */
	scale: number;
	/** Accessible name for the whole map. */
	title: string;
	className: string | undefined;
	/** Absent means the map is inert decoration rather than a control. */
	onNodePress: ((nodeId: NodeId) => void) | undefined;
	/**
	 * Draw one node yourself, React-only. A backend that cannot honour this —
	 * anything not building a React tree per node — should ignore it; the prop's
	 * documentation already says it is the one way to diverge.
	 */
	renderNode: ((nodeId: NodeId, status: NodeStatus) => ReactElement | undefined) | undefined;
}

export interface RenderBackend {
	readonly id: string;
	/**
	 * Whether a node can be focused and operated from the keyboard.
	 *
	 * `false` is a real cost, not a detail: a canvas is one element, so there is
	 * nothing for a screen reader to land on. Recorded here so a host can choose
	 * with the trade-off in front of it rather than discovering it later.
	 */
	readonly keyboardAccessible: boolean;
	readonly Component: ComponentType<BackendProps>;
}

/** The backend every map uses unless a host names another. */
export const SVG_BACKEND_ID = "svg";
