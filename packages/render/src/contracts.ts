import type { MapDocument, NodeId, NodeStatus, SpireNode, StateDocument } from "@edv4h/spire-core";
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
	onNodePress?: (nodeId: NodeId) => void;
	/**
	 * Escape hatch: draw a node yourself. Return `undefined` or `null` to fall
	 * back to the theme's circle, so a host can special-case one type without
	 * reimplementing the rest. The returned element is placed inside a `<g>`
	 * already translated to the node's centre — draw around the origin.
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
