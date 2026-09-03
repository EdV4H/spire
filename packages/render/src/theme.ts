import type { NodeStatus, NodeTypeId } from "@edv4h/spire-core";

/**
 * Theme contracts.
 *
 * A theme maps node **type ids** — which the SDK treats as opaque — to
 * appearance. The mapping is the application's to supply, because only the
 * application knows that its `"gate"` should look like a checkpoint. The SDK
 * ships one neutral theme so a map renders as something legible before anyone
 * has designed anything.
 */

export interface NodeStyle {
	/** Radius in px for the default circular node. */
	size: number;
	fill: string;
	stroke: string;
	strokeWidth: number;
	/** 0-1. The usual way to say "this one is not available yet". */
	opacity?: number;
	/** Overrides applied per status, merged over the base. */
	byStatus?: Partial<Record<NodeStatus, Partial<Omit<NodeStyle, "byStatus">>>>;
}

export interface EdgeStyle {
	stroke: string;
	strokeWidth: number;
	/** Dash pattern in px, e.g. `[4, 6]`. Omit for a solid line. */
	dash?: readonly number[];
	/** Style for an edge between two completed nodes. */
	completed?: Partial<Omit<EdgeStyle, "completed">>;
}

/**
 * Node styles keyed by type id. `default` is required and covers every type the
 * theme does not name, so `resolveNodeStyle` always has something to return —
 * a theme cannot leave a host-defined type unstyled.
 */
export type ThemeNodeStyles = { default: NodeStyle } & {
	[type: NodeTypeId]: NodeStyle | undefined;
};

export interface SpireTheme {
	node: ThemeNodeStyles;
	edge: EdgeStyle;
	background?: string;
	jitter: { amount: number };
	spacing: { col: number; row: number };
}

/**
 * A deliberately plain theme: one shape, three states, no personality. It
 * exists so that `<SpireMap>` renders something correct without a design pass,
 * and so that a host's own theme has a complete object to spread over.
 */
export const defaultTheme: SpireTheme = {
	node: {
		default: {
			size: 18,
			fill: "#f4f4f5",
			stroke: "#71717a",
			strokeWidth: 2,
			byStatus: {
				completed: { fill: "#18181b", stroke: "#18181b" },
				reachable: { fill: "#ffffff", stroke: "#18181b", strokeWidth: 3 },
				locked: { fill: "#fafafa", stroke: "#d4d4d8", opacity: 0.55 },
			},
		},
	},
	edge: {
		stroke: "#d4d4d8",
		strokeWidth: 2,
		completed: { stroke: "#18181b", strokeWidth: 3 },
	},
	jitter: { amount: 8 },
	spacing: { col: 96, row: 120 },
};

/** The style for a node, with its status overrides already merged in. */
export function resolveNodeStyle(
	theme: SpireTheme,
	type: NodeTypeId,
	status: NodeStatus,
): Omit<NodeStyle, "byStatus"> {
	const base = theme.node[type] ?? theme.node.default;
	const { byStatus, ...rest } = base;
	return { ...rest, ...(byStatus?.[status] ?? {}) };
}

/** The style for an edge, given whether both of its nodes are completed. */
export function resolveEdgeStyle(theme: SpireTheme, completed: boolean): EdgeStyle {
	return completed ? { ...theme.edge, ...(theme.edge.completed ?? {}) } : theme.edge;
}
