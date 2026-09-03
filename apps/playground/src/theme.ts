import { defaultTheme, type SpireTheme } from "@edv4h/spire-render";

/**
 * The playground's own theme.
 *
 * The SDK ships one neutral theme and no opinion about what a `gate` looks
 * like — node types are host-defined strings. Supplying colours here is the
 * host doing its job, and it doubles as the demonstration that per-type
 * styling is an application concern.
 */
const typeStyle = (fill: string, stroke: string) => ({
	size: 13,
	fill,
	stroke,
	strokeWidth: 2,
	byStatus: {
		completed: { fill: stroke, stroke },
		reachable: { fill, stroke, strokeWidth: 3.5, size: 15 },
		locked: { fill: "#f1f2f4", stroke: "#c3c8cf", opacity: 0.5 },
	},
});

export const playgroundTheme: SpireTheme = {
	...defaultTheme,
	node: {
		default: typeStyle("#e7e9ec", "#5d6672"),
		step: typeStyle("#e7e9ec", "#5d6672"),
		gate: typeStyle("#fdeab3", "#b45309"),
		bonus: typeStyle("#c9dcfd", "#1d4ed8"),
		boss: typeStyle("#f7cdc4", "#b91c1c"),
		final: typeStyle("#f7cde3", "#9d174d"),
	},
	edge: {
		stroke: "#d5d9df",
		strokeWidth: 2,
		completed: { stroke: "#2a3038", strokeWidth: 3 },
	},
	jitter: { amount: 7 },
	spacing: { col: 66, row: 66 },
	background: "#ffffff",
};
