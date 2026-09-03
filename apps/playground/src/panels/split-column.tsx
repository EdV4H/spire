import {
	type CSSProperties,
	type PointerEvent,
	type ReactNode,
	useCallback,
	useRef,
	useState,
} from "react";

interface Props {
	top: ReactNode;
	bottom: ReactNode;
	/** Height of the top pane as a percentage of the column. */
	initial?: number;
	min?: number;
	max?: number;
	label: string;
}

/**
 * Two stacked panes with a draggable divider between them.
 *
 * The two things the left column holds — the plugin list and the spec editor —
 * are wanted in different proportions depending on what you are doing: a long
 * spec wants the editor, comparing plugin errors wants the list. A fixed split
 * is wrong for both.
 *
 * The divider is a real separator: focusable, moved with the arrow keys, and
 * reporting its position. A drag handle that only works with a mouse is a
 * control some people simply cannot reach.
 */
export function SplitColumn({ top, bottom, initial = 46, min = 15, max = 85, label }: Props) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const dragging = useRef(false);
	const [ratio, setRatio] = useState(initial);

	const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [min, max]);

	const applyPointer = useCallback(
		(clientY: number) => {
			const box = containerRef.current?.getBoundingClientRect();
			if (box === undefined || box.height === 0) return;
			setRatio(clamp(((clientY - box.top) / box.height) * 100));
		},
		[clamp],
	);

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragging.current = true;
	};

	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		applyPointer(event.clientY);
	};

	const endDrag = (event: PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		dragging.current = false;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	return (
		// The ratio travels as a custom property rather than an inline height, so
		// the narrow-screen rules can drop back to auto without fighting inline
		// specificity.
		<div
			className="split"
			ref={containerRef}
			style={{ "--split-top": `${ratio}%` } as CSSProperties}
		>
			<div className="split-pane split-pane--top">{top}</div>

			{/* biome-ignore lint/a11y/useSemanticElements: an <hr> cannot be focused or
			    dragged. A focusable separator is the ARIA window-splitter pattern. */}
			<div
				className="splitter"
				role="separator"
				aria-label={label}
				aria-valuenow={Math.round(ratio)}
				aria-valuemin={min}
				aria-valuemax={max}
				tabIndex={0}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onDoubleClick={() => setRatio(initial)}
				onKeyDown={(event) => {
					const step = event.shiftKey ? 10 : 2;
					if (event.key === "ArrowUp") {
						event.preventDefault();
						setRatio((current) => clamp(current - step));
					} else if (event.key === "ArrowDown") {
						event.preventDefault();
						setRatio((current) => clamp(current + step));
					} else if (event.key === "Home") {
						event.preventDefault();
						setRatio(initial);
					}
				}}
			>
				<span className="splitter-grip" aria-hidden="true" />
			</div>

			<div className="split-pane split-pane--rest">{bottom}</div>
		</div>
	);
}
