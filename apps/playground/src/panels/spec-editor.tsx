import type { ReactElement } from "react";
import { type Preset, presets } from "../presets.js";

interface Props {
	presetId: string;
	onPreset: (preset: Preset) => void;
	text: string;
	onText: (text: string) => void;
	parseError: string | undefined;
	onGenerate: () => void;
	busy: boolean;
}

export function SpecEditor({
	presetId,
	onPreset,
	text,
	onText,
	parseError,
	onGenerate,
	busy,
}: Props): ReactElement {
	const active = presets.find((preset) => preset.id === presetId);

	return (
		<section className="panel panel--fill">
			<h2>GenSpec</h2>
			<p className="hint">
				振る舞いはすべて文字列 ID で参照する。ここに関数は入らないので、この JSON は
				そのまま保存・共有できる。
			</p>

			<div className="chips">
				{presets.map((preset) => (
					<button
						key={preset.id}
						type="button"
						className={preset.id === presetId ? "chip chip--on" : "chip"}
						onClick={() => onPreset(preset)}
					>
						{preset.label}
					</button>
				))}
			</div>
			{active !== undefined && <p className="hint">{active.note}</p>}

			<textarea
				className="editor mono"
				spellCheck={false}
				value={text}
				onChange={(event) => onText(event.target.value)}
			/>

			{parseError !== undefined && (
				<div className="alert alert--error">
					<span className="mono">JSON</span> — {parseError}
				</div>
			)}

			<button type="button" className="primary" onClick={onGenerate} disabled={busy}>
				{busy ? "生成中…" : "生成する"}
			</button>
		</section>
	);
}
