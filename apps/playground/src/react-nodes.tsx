import type { NodeStatus, SpireNode } from "@edv4h/spire-core";
import type { ReactElement } from "react";
import { playgroundTheme } from "./theme.js";

/**
 * The React escape hatch, demonstrated.
 *
 * `renderNode` returns JSX rather than shapes, so it draws whatever React can
 * draw — here an HTML card inside a `<foreignObject>`, with a border radius, a
 * shadow, flex layout and a status pill. None of that is expressible in the
 * shape vocabulary, which is exactly why the escape hatch exists.
 *
 * And exactly why it is the *escape hatch* and not the recommended route: this
 * runs in React and nowhere else. `renderToSVG` draws the theme's circle
 * instead, and the canvas backend ignores it too. Switch either on with a card
 * showing and the difference is immediate — which is the point of having it
 * reachable here.
 */

const STATUS_LABEL: Record<NodeStatus, string> = {
	completed: "完了",
	reachable: "行ける",
	locked: "まだ",
};

const STATUS_COLOR: Record<NodeStatus, string> = {
	completed: "#166534",
	reachable: "#1d4ed8",
	locked: "#9aa1ab",
};

const CARD = { width: 168, height: 48 } as const;

export function renderCardNode(node: SpireNode, status: NodeStatus): ReactElement {
	const accent = playgroundTheme.node[node.type]?.stroke ?? "#5d6672";
	const title = typeof node.data?.title === "string" ? node.data.title : node.type;

	return (
		// The `<g>` around this is already translated to the node's centre, so the
		// card is placed by half its own size rather than by any absolute position.
		<foreignObject
			x={-CARD.width / 2}
			y={-CARD.height / 2}
			width={CARD.width}
			height={CARD.height}
			style={{ overflow: "visible" }}
		>
			<div
				style={{
					width: `${CARD.width}px`,
					height: `${CARD.height}px`,
					boxSizing: "border-box",
					display: "flex",
					alignItems: "center",
					gap: "8px",
					padding: "6px 10px",
					borderRadius: "8px",
					border: `1px solid ${status === "locked" ? "#e3e6ea" : accent}`,
					borderLeft: `4px solid ${accent}`,
					background: "#fff",
					boxShadow: status === "locked" ? "none" : "0 1px 4px rgba(20,26,34,0.14)",
					opacity: status === "locked" ? 0.55 : 1,
					font: '12px/1.3 system-ui, "Hiragino Sans", sans-serif',
					color: "#1b2028",
				}}
			>
				<div style={{ minWidth: 0, flex: 1 }}>
					<div
						style={{
							fontWeight: 600,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{title}
					</div>
					{/* The id rather than the type: the accent bar already carries the
					    type, and a provider's title usually names it too. */}
					<div
						style={{
							color: "#9aa1ab",
							fontSize: "10px",
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						}}
					>
						{node.id}
					</div>
				</div>
				<span
					style={{
						flex: "none",
						fontSize: "10px",
						padding: "2px 6px",
						borderRadius: "999px",
						color: STATUS_COLOR[status],
						background: `${STATUS_COLOR[status]}1a`,
					}}
				>
					{STATUS_LABEL[status]}
				</span>
			</div>
		</foreignObject>
	);
}

/**
 * Cards need room the default circles do not, so the demo widens the grid with
 * it. Spacing is a theme concern, which is why this is a value and not a hack
 * inside the renderer.
 */
export const CARD_SPACING = { col: 196, row: 86 } as const;
