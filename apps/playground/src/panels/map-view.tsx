import type { MapDocument, NodeId, StateDocument } from "@edv4h/spire-core";
import type { Orientation } from "@edv4h/spire-layout";
import { SpireMap } from "@edv4h/spire-render";
import type { ReactElement } from "react";
import { playgroundTheme } from "../theme.js";

export interface ViewSettings {
	orientation: Orientation;
	jitter: number;
	curvature: number;
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

export function MapView({
	map,
	state,
	view,
	onView,
	onNodePress,
	focusNodeId,
	transitions,
}: Props): ReactElement {
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
			</div>

			<div className="canvas">
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
						onNodePress={onNodePress}
						{...(focusNodeId === undefined ? {} : { focusNodeId })}
					/>
				)}
			</div>

			<div className="map-foot">
				<p className="hint">ノードを押すと完了／取り消し。下端が row 0、上端が終端行。</p>
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
