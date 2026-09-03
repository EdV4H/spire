import type { MapDocument, NodeId, NodeStatus, SpireNode, StateDocument } from "@edv4h/spire-core";
import type { Orientation } from "@edv4h/spire-layout";
import type { SpireTheme } from "./theme.js";

/**
 * Renderer contracts — **types only in v0.1.**
 *
 * The React component, `renderToSVG` and `renderToPNG` are not implemented yet.
 * They are declared here because the surface is settled and both the layout
 * package and application code are written against it; the implementations land
 * in the next release. Nothing in this file has a runtime behaviour to rely on,
 * and no export here silently no-ops — there is simply nothing to call.
 */

export interface SpireMapProps {
	map: MapDocument;
	state: StateDocument;
	theme?: SpireTheme;
	orientation?: Orientation;
	onNodePress?: (nodeId: NodeId) => void;
	/**
	 * Escape hatch: draw a node yourself. Returning `undefined` falls back to
	 * the theme's default rendering, so a host can special-case one type
	 * without reimplementing the rest.
	 */
	renderNode?: (node: SpireNode, status: NodeStatus) => unknown;
	/**
	 * Fired when a node's derived status changes between renders. Animation is
	 * an application concern; the renderer only says *when*, never *how*.
	 */
	onNodeStatusChange?: (change: { nodeId: NodeId; from: NodeStatus; to: NodeStatus }) => void;
	/** Scroll the node into view on mount and whenever it changes. */
	focusNodeId?: NodeId;
}

export interface StaticRenderOptions {
	theme?: SpireTheme;
	orientation?: Orientation;
	/** Scale factor applied to the layout's natural size. */
	scale?: number;
	background?: string;
}
