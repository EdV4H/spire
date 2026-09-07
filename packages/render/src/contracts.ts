import type {
	MapDocument,
	NodeId,
	NodeStatus,
	Spire,
	SpireNode,
	StateDocument,
} from "@edv4h/spire-core";
import type { Orientation } from "@edv4h/spire-layout";
import type { ReactElement } from "react";
import type { SpireTheme } from "./theme.js";

export interface SpireMapProps {
	map: MapDocument;
	state: StateDocument;
	theme?: SpireTheme;
	orientation?: Orientation;
	/** Overrides the theme's spacing. */
	spacing?: { col: number; row: number };
	/** Overrides the theme's jitter. */
	jitter?: { amount: number; seed?: number };
	padding?: number;
	curvature?: number;
	/**
	 * Multiplies the drawn size. The `viewBox` keeps the layout's natural size,
	 * so nothing is laid out again — the same scene is simply drawn larger or
	 * smaller, which is exactly what `renderToSVG`'s `scale` does. Defaults to 1.
	 */
	scale?: number;
	/**
	 * Supplies the renderer registries, so a theme's `renderer` ids resolve.
	 * Without it every node and edge draws the built-in look.
	 */
	spire?: Spire;
	onNodePress?: (nodeId: NodeId) => void;
	/**
	 * Escape hatch: draw a node yourself. Return `undefined` or `null` to fall
	 * back to the theme's circle, so a host can special-case one type without
	 * reimplementing the rest. The returned element is placed inside a `<g>`
	 * already translated to the node's centre — draw around the origin.
	 *
	 * **React only.** `renderToSVG` cannot run this, so a node drawn through it
	 * looks different in a share image. Prefer registering a `NodeRenderer`,
	 * which returns shapes both backends can draw; reach for this when the node
	 * genuinely needs React (a `foreignObject`, a component you already have).
	 */
	renderNode?: (node: SpireNode, status: NodeStatus) => ReactElement | null | undefined;
	/**
	 * Fired when a node's derived status changes between renders. Animation is
	 * an application concern; the renderer says *when*, never *how*.
	 */
	onNodeStatusChange?: (change: { nodeId: NodeId; from: NodeStatus; to: NodeStatus }) => void;
	/** Scrolled into view whenever it changes. */
	focusNodeId?: NodeId;
	className?: string;
	/** Accessible name for the whole map. Defaults to "Spire map". */
	title?: string;
}

/** Options accepted by the static renderers. */
export interface StaticRenderOptions {
	theme?: SpireTheme;
	orientation?: Orientation;
	scale?: number;
	background?: string;
}
