import {
	complete,
	emptyState,
	getNodeStatus,
	type MapDocument,
	mergeStates,
	type NodeId,
	type StateDocument,
	uncomplete,
} from "@edv4h/spire-core";
import { type GenSpecInput, generate, insertNode, regenerate } from "@edv4h/spire-gen";
import { renderToSVG } from "@edv4h/spire-render";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { Inspector } from "./panels/inspector.js";
import { MapView, type Transition, type ViewSettings } from "./panels/map-view.js";
import { PluginList } from "./panels/plugin-list.js";
import { SpecEditor } from "./panels/spec-editor.js";
import { SplitColumn } from "./panels/split-column.js";
import { defaultEnabled } from "./plugins.js";
import { defaultPreset, type Preset, presets } from "./presets.js";
import { playgroundTheme } from "./theme.js";
import { useSpire } from "./use-spire.js";

/**
 * The playground.
 *
 * Its job is to make the SDK's behaviour reachable by hand: toggle a plugin and
 * watch a spec stop resolving, change a policy and watch the same click be
 * refused, break a constraint and read the validator's own message. It is a
 * test surface, not a product — the UI is deliberately plain so that what you
 * notice is the SDK, not the app.
 */
export function App(): ReactElement {
	const [enabled, setEnabled] = useState<readonly string[]>(defaultEnabled);
	const { spire, errors: pluginErrors, loading } = useSpire(enabled);

	const [presetId, setPresetId] = useState(defaultPreset.id);
	const [specText, setSpecText] = useState(() => JSON.stringify(defaultPreset.spec, null, 2));
	const [map, setMap] = useState<MapDocument | undefined>(undefined);
	const [state, setState] = useState<StateDocument>({
		smfVersion: "0.1",
		mapId: "",
		completed: {},
	});

	const [genError, setGenError] = useState<string | undefined>(undefined);
	const [busy, setBusy] = useState(false);
	const [policy, setPolicy] = useState("single-route");
	const [violation, setViolation] = useState<string | undefined>(undefined);
	// Selection and focus are separate on purpose. Clicking a node selects it —
	// the inspector follows — but must not move the view: the thing you just
	// clicked is by definition already where you are looking. Focus is only for
	// moving the viewer somewhere they did not click, like a freshly inserted
	// node further up the map.
	const [selectedNodeId, setSelectedNodeId] = useState<NodeId | undefined>(undefined);
	const [focusNodeId, setFocusNodeId] = useState<NodeId | undefined>(undefined);
	const [transitions, setTransitions] = useState<readonly Transition[]>([]);

	const log = useCallback((text: string) => {
		setTransitions((list) => [{ id: nextLogId(), text }, ...list]);
	}, []);
	const [snapshot, setSnapshot] = useState<StateDocument | undefined>(undefined);
	const [view, setView] = useState<ViewSettings>({
		orientation: "bottom-up",
		jitter: 7,
		curvature: 0.45,
		scale: 1,
	});

	const parsed = useMemo(() => parseSpec(specText), [specText]);

	const policies = spire?.policies.ids() ?? ["single-route", "strict", "free"];

	const runGenerate = useCallback(async () => {
		if (parsed.error !== undefined) return;
		setBusy(true);
		setGenError(undefined);
		setViolation(undefined);

		const result = await generate(parsed.spec as GenSpecInput, {
			...(spire === undefined ? {} : { spire }),
		});
		setBusy(false);

		if (!result.ok) {
			setGenError(`${result.error.code} — ${result.error.message}`);
			return;
		}
		setMap(result.value);
		setState(emptyState(result.value));
		setSelectedNodeId(undefined);
		setFocusNodeId(undefined);
		setTransitions([]);
		setSnapshot(undefined);
	}, [parsed, spire]);

	const onNodePress = useCallback(
		(nodeId: NodeId) => {
			if (map === undefined) return;
			setSelectedNodeId(nodeId);
			setViolation(undefined);

			const before = getNodeStatus(map, state, nodeId);
			if (before === "completed") {
				setState(uncomplete(state, nodeId));
				log(`${nodeId}: completed → 取り消し`);
				return;
			}

			const result = complete(map, state, nodeId, {
				policy,
				...(spire === undefined ? {} : { spire }),
				at: new Date().toISOString(),
				by: "playground",
			});

			if (!result.ok) {
				setViolation(`${result.error.code} — ${result.error.message}`);
				return;
			}
			setState(result.value);
			log(`${nodeId}: ${before} → completed`);
		},
		[map, state, policy, spire, log],
	);

	const onRegenerate = useCallback(async () => {
		if (map === undefined || parsed.error !== undefined) return;
		setBusy(true);
		const result = await regenerate(map, parsed.spec as GenSpecInput, {
			keepCompleted: state,
			...(spire === undefined ? {} : { spire }),
		});
		setBusy(false);

		if (!result.ok) {
			setGenError(`${result.error.code} — ${result.error.message}`);
			return;
		}
		setGenError(undefined);
		setMap(result.value);
	}, [map, parsed, state, spire]);

	const onInsert = useCallback(() => {
		if (map === undefined) return;
		const row = Math.floor(map.grid.rows / 2);
		const result = insertNode(map, { type: map.nodeTypes[0]?.id ?? "step", row });

		if (!result.ok) {
			setGenError(`${result.error.code} — ${result.error.message}`);
			return;
		}
		setGenError(undefined);
		setMap(result.value.map);
		setSelectedNodeId(result.value.nodeId);
		setFocusNodeId(result.value.nodeId);
	}, [map]);

	const onExportSvg = useCallback(() => {
		if (map === undefined) return;
		const svg = renderToSVG(map, state, {
			theme: playgroundTheme,
			orientation: view.orientation,
			jitter: { amount: view.jitter },
			curvature: view.curvature,
			title: `Spire map ${map.id}`,
		});
		void navigator.clipboard?.writeText(svg);
		log(`renderToSVG: ${svg.length} 文字をコピーした`);
	}, [map, state, view, log]);

	return (
		<div className="layout">
			<aside className="column column--left">
				<SplitColumn
					label="プラグインと GenSpec の高さ"
					top={
						<PluginList
							enabled={enabled}
							onToggle={(id) =>
								setEnabled((current) =>
									current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
								)
							}
							spire={spire}
							errors={pluginErrors}
						/>
					}
					bottom={
						<SpecEditor
							presetId={presetId}
							onPreset={(preset: Preset) => {
								setPresetId(preset.id);
								setSpecText(JSON.stringify(preset.spec, null, 2));
								setEnabled((current) => [
									...new Set([
										...current,
										...preset.requires.filter((id) => !current.includes(id)),
									]),
								]);
							}}
							text={specText}
							onText={(text) => {
								setSpecText(text);
								setPresetId(
									presets.find((p) => JSON.stringify(p.spec, null, 2) === text)?.id ?? "",
								);
							}}
							parseError={parsed.error}
							onGenerate={() => void runGenerate()}
							busy={busy || loading}
						/>
					}
				/>
			</aside>

			<main className="column column--center">
				{genError !== undefined && (
					<div className="alert alert--error">
						<strong>生成に失敗した</strong>
						<p>{genError}</p>
					</div>
				)}

				<div className="panel actions">
					<label>
						<span className="hint">進行ポリシー</span>
						<select value={policy} onChange={(event) => setPolicy(event.target.value)}>
							{policies.map((id) => (
								<option key={id} value={id}>
									{id}
								</option>
							))}
						</select>
					</label>

					<button type="button" onClick={() => void onRegenerate()} disabled={map === undefined}>
						未完了を再生成
					</button>
					<button type="button" onClick={onInsert} disabled={map === undefined}>
						ノードを挿入
					</button>
					<button
						type="button"
						onClick={() => map !== undefined && setState(emptyState(map))}
						disabled={map === undefined}
					>
						進行をリセット
					</button>
					<button type="button" onClick={onExportSvg} disabled={map === undefined}>
						SVG をコピー
					</button>

					{snapshot === undefined ? (
						<button type="button" onClick={() => setSnapshot(state)} disabled={map === undefined}>
							状態を分岐
						</button>
					) : (
						<button
							type="button"
							onClick={() => {
								setState(mergeStates(snapshot, state));
								setSnapshot(undefined);
								log("mergeStates: 分岐した状態を統合した");
							}}
						>
							分岐をマージ
						</button>
					)}
				</div>

				{violation !== undefined && (
					<div className="alert alert--warn">
						<strong>ポリシーが拒否した</strong>
						<p>{violation}</p>
					</div>
				)}

				{snapshot !== undefined && (
					<div className="alert alert--note">
						分岐中。別のノードを完了させてから「分岐をマージ」を押すと、CRDT マージの結果が入る。
					</div>
				)}

				<MapView
					map={map}
					state={state}
					view={view}
					onView={setView}
					onNodePress={onNodePress}
					focusNodeId={focusNodeId}
					transitions={transitions}
				/>
			</main>

			<aside className="column column--right">
				<Inspector
					spire={spire}
					map={map}
					state={state}
					selectedNodeId={selectedNodeId}
					policy={policy}
				/>
			</aside>
		</div>
	);
}

let logCounter = 0;
function nextLogId(): number {
	logCounter += 1;
	return logCounter;
}

function parseSpec(text: string): { spec: unknown; error: string | undefined } {
	try {
		return { spec: JSON.parse(text), error: undefined };
	} catch (error) {
		return { spec: undefined, error: error instanceof Error ? error.message : String(error) };
	}
}
