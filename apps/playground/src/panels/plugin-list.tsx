import type { PluginError, Spire } from "@edv4h/spire-core";
import type { ReactElement } from "react";
import { availablePlugins } from "../plugins.js";

interface Props {
	enabled: readonly string[];
	onToggle: (id: string) => void;
	spire: Spire | undefined;
	errors: readonly PluginError[];
}

export function PluginList({ enabled, onToggle, spire, errors }: Props): ReactElement {
	const loaded = spire?.plugins.getAll() ?? [];

	return (
		<section className="panel">
			<h2>プラグイン</h2>
			<p className="hint">
				チェックを外すと <code>createSpire</code> を組み直す。依存の欠けたプラグインは
				静かに無視されず、エラーで返る。
			</p>

			<ul className="checklist">
				{availablePlugins.map((entry) => (
					<li key={entry.id}>
						<label>
							<input
								type="checkbox"
								checked={enabled.includes(entry.id)}
								onChange={() => onToggle(entry.id)}
							/>
							<span className="mono">{entry.label}</span>
						</label>
						<span className="hint">{entry.note}</span>
						{entry.requires.length > 0 && (
							<span className="hint mono">requires: {entry.requires.join(", ")}</span>
						)}
					</li>
				))}
			</ul>

			{errors.length > 0 && (
				<div className="alert alert--error">
					<strong>createSpire が失敗した</strong>
					<ul>
						{errors.map((error) => (
							<li key={`${error.code}:${error.pluginId ?? ""}:${error.message}`}>
								<span className="mono">{error.code}</span> — {error.message}
							</li>
						))}
					</ul>
				</div>
			)}

			{spire !== undefined && (
				<div className="loaded">
					<span className="hint">setup 順（依存でトポロジカルソート済み）</span>
					<ol className="mono ordered">
						{loaded.map((plugin) => (
							<li key={plugin.id}>{plugin.id}</li>
						))}
					</ol>
				</div>
			)}
		</section>
	);
}
