import type { MapDocument, NodeId, StateDocument } from "@edv4h/spire-core";
import type { Orientation } from "@edv4h/spire-layout";
import { SpireMap } from "@edv4h/spire-render";
import { type ReactElement, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { playgroundTheme } from "../theme.js";

export interface ViewSettings {
	orientation: Orientation;
	jitter: number;
	curvature: number;
	/** Drawn size multiplier. 1 is the layout's natural size. */
	scale: number;
}

interface Props {
	map: MapDocument | undefined;
	state: StateDocument;
	view: ViewSettings;
	onView: (view: ViewSettings) => void;
	onNodePress: (nodeId: NodeId) => void;
	focusNodeId: NodeId | undefined;
	/** Latest status transitions, newest first. */
	transitions: readonly Transition[];
}

/** A log line with an id of its own, so identical messages stay distinct. */
export interface Transition {
	id: number;
	text: string;
}

const ORIENTATIONS: readonly Orientation[] = ["bottom-up", "top-down", "left-right", "right-left"];

const ZOOM = { min: 0.25, max: 4, step: 1.25 } as const;

/** Where a zoom should keep the picture still, in scene coordinates. */
interface ZoomAnchor {
	sceneX: number;
	sceneY: number;
	/** Offset of that point from the viewport's top-left, in screen pixels. */
	viewX: number;
	viewY: number;
}

export function MapView({
	map,
	state,
	view,
	onView,
	onNodePress,
	focusNodeId,
	transitions,
}: Props): ReactElement {
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const pendingAnchor = useRef<ZoomAnchor | undefined>(undefined);

	/**
	 * Zoom while holding one point of the map still.
	 *
	 * Without this the view jumps to wherever the scroll offsets happen to land,
	 * which on a tall map means losing your place on every step. `client` is the
	 * point to keep fixed — the pointer for a wheel zoom, the viewport's centre
	 * for the buttons.
	 */
	const zoomTo = useCallback(
		(next: number, client?: { x: number; y: number }) => {
			const scale = clamp(next, ZOOM.min, ZOOM.max);
			if (scale === view.scale) return;

			const canvas = canvasRef.current;
			if (canvas !== null) {
				const box = canvas.getBoundingClientRect();
				const viewX = client === undefined ? canvas.clientWidth / 2 : client.x - box.left;
				const viewY = client === undefined ? canvas.clientHeight / 2 : client.y - box.top;
				pendingAnchor.current = {
					sceneX: (canvas.scrollLeft + viewX) / view.scale,
					sceneY: (canvas.scrollTop + viewY) / view.scale,
					viewX,
					viewY,
				};
			}

			onView({ ...view, scale });
		},
		[view, onView],
	);

	// Applied after the browser has laid the new size out but before it paints,
	// so the scroll correction is never visible as a flash.
	useLayoutEffect(() => {
		const anchor = pendingAnchor.current;
		pendingAnchor.current = undefined;

		const canvas = canvasRef.current;
		if (anchor === undefined || canvas === null) return;

		canvas.scrollLeft = anchor.sceneX * view.scale - anchor.viewX;
		canvas.scrollTop = anchor.sceneY * view.scale - anchor.viewY;
	}, [view.scale]);

	// Ctrl/⌘ + wheel, the gesture every map application uses. Registered by hand
	// because the listener has to be non-passive to call `preventDefault`, which
	// is what stops the browser zooming the whole page instead.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null) return;

		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			const factor = event.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step;
			zoomTo(view.scale * factor, { x: event.clientX, y: event.clientY });
		};

		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", onWheel);
	}, [zoomTo, view.scale]);

	/**
	 * Scale so the whole map fits the pane.
	 *
	 * The natural size is read off the drawn `<svg>`'s viewBox rather than
	 * recomputed: the viewBox *is* the scene's size, so what gets fitted is
	 * always exactly what is on screen.
	 */
	const onFit = useCallback(() => {
		const canvas = canvasRef.current;
		const svg = canvas?.querySelector("svg");
		if (canvas === null || svg === null || svg === undefined) return;

		const box = svg.viewBox.baseVal;
		if (box.width === 0 || box.height === 0) return;

		// Matches `.canvas`'s padding, so the fitted map is not flush to the edge.
		const room = 16;
		const fit = Math.min(
			(canvas.clientWidth - room) / box.width,
			(canvas.clientHeight - room) / box.height,
		);
		zoomTo(fit);
	}, [zoomTo]);

	return (
		<section className="panel panel--map">
			<div className="map-controls">
				<label>
					<span className="hint">orientation</span>
					<select
						value={view.orientation}
						onChange={(event) =>
							onView({ ...view, orientation: event.target.value as Orientation })
						}
					>
						{ORIENTATIONS.map((orientation) => (
							<option key={orientation} value={orientation}>
								{orientation}
							</option>
						))}
					</select>
				</label>

				<label>
					<span className="hint">jitter {view.jitter}</span>
					<input
						type="range"
						min={0}
						max={24}
						value={view.jitter}
						onChange={(event) => onView({ ...view, jitter: Number(event.target.value) })}
					/>
				</label>

				<label>
					<span className="hint">curvature {view.curvature.toFixed(2)}</span>
					<input
						type="range"
						min={0}
						max={90}
						value={view.curvature * 100}
						onChange={(event) => onView({ ...view, curvature: Number(event.target.value) / 100 })}
					/>
				</label>

				<div className="zoom">
					<button
						type="button"
						onClick={() => zoomTo(view.scale / ZOOM.step)}
						disabled={map === undefined || view.scale <= ZOOM.min}
						aria-label="縮小"
					>
						−
					</button>
					<span className="zoom__value mono">{Math.round(view.scale * 100)}%</span>
					<button
						type="button"
						onClick={() => zoomTo(view.scale * ZOOM.step)}
						disabled={map === undefined || view.scale >= ZOOM.max}
						aria-label="拡大"
					>
						+
					</button>
					<button type="button" onClick={() => zoomTo(1)} disabled={map === undefined}>
						等倍
					</button>
					<button type="button" onClick={onFit} disabled={map === undefined}>
						全体
					</button>
				</div>
			</div>

			<div className="canvas" ref={canvasRef}>
				{map === undefined ? (
					<p className="empty">まだマップがない。左で「生成する」を押す。</p>
				) : (
					<SpireMap
						map={map}
						state={state}
						theme={playgroundTheme}
						orientation={view.orientation}
						jitter={{ amount: view.jitter }}
						curvature={view.curvature}
						scale={view.scale}
						onNodePress={onNodePress}
						{...(focusNodeId === undefined ? {} : { focusNodeId })}
					/>
				)}
			</div>

			<div className="map-foot">
				<p className="hint">
					ノードを押すと完了／取り消し。下端が row 0、上端が終端行。⌘/Ctrl +
					ホイールで拡大縮小。既定の <code>single-route</code>{" "}
					では道は1本しか選べない（分岐の片方を通ると、もう片方は閉じる）。
				</p>
				{transitions.length > 0 && (
					<ul className="transitions mono">
						{transitions.slice(0, 4).map((entry) => (
							<li key={entry.id}>{entry.text}</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
