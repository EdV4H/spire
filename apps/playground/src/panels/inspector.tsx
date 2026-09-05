import {
	getProgress,
	type MapDocument,
	type NodeId,
	type Spire,
	type StateDocument,
	validateMap,
} from "@edv4h/spire-core";
import { getGenRegistries } from "@edv4h/spire-gen";
import type { ReactElement } from "react";
import { NodeTypes } from "./node-types.js";

interface Props {
	spire: Spire | undefined;
	map: MapDocument | undefined;
	state: StateDocument;
	selectedNodeId: NodeId | undefined;
}

/**
 * What the SDK currently knows, from the SDK itself — registries with their
 * attribution, derived progress, and the validator's own output. Nothing here
 * is recomputed by the app.
 */
export function Inspector({ spire, map, state, selectedNodeId }: Props): ReactElement {
	const gen = spire === undefined ? undefined : getGenRegistries(spire);
	const validation = map === undefined ? undefined : validateMap(map, spire);
	const progress = map === undefined ? undefined : getProgress(map, state);
	const selected = map?.nodes.find((node) => node.id === selectedNodeId);

	return (
		<section className="panel">
			<h2>インスペクタ</h2>

			{progress !== undefined && (
				<div className="block">
					<h3>進行</h3>
					<dl className="stats mono">
						<div>
							<dt>completed</dt>
							<dd>
								{progress.completedCount} / {progress.total}
							</dd>
						</div>
						<div>
							<dt>reachable</dt>
							<dd>{progress.reachableCount}</dd>
						</div>
						<div>
							<dt>longest path</dt>
							<dd>{progress.longestCompletedPath}</dd>
						</div>
						<div>
							<dt>terminal</dt>
							<dd>{progress.reachedTerminal ? "到達" : "未到達"}</dd>
						</div>
					</dl>
				</div>
			)}

			<NodeTypes spire={spire} map={map} />

			{validation !== undefined && (
				<div className="block">
					<h3>validateMap</h3>
					{validation.ok ? (
						<p className="ok mono">不変条件をすべて満たしている</p>
					) : (
						<ul className="errors">
							{validation.error.map((issue) => (
								<li key={`${issue.code}:${issue.path.join(".")}:${issue.message}`}>
									<span className="mono">{issue.code}</span> — {issue.message}
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			{selected !== undefined && (
				<div className="block">
					<h3>選択中のノード</h3>
					<pre className="mono json">{JSON.stringify(selected, null, 2)}</pre>
				</div>
			)}

			{spire !== undefined && (
				<div className="block">
					<h3>レジストリ</h3>
					<p className="hint">登録は id で引かれ、どのプラグインが登録したかが記録されている。</p>
					<Registry
						title="policies"
						rows={spire.policies.attributions().map((entry) => ({
							id: entry.entry.id,
							by: entry.pluginId,
						}))}
					/>
					<Registry
						title="nodeTypes"
						rows={spire.nodeTypes.attributions().map((entry) => ({
							id: entry.entry.id,
							by: entry.pluginId,
						}))}
					/>
					<Registry
						title="validators"
						rows={spire.validators.attributions().map((entry) => ({
							id: entry.entry.id,
							by: entry.pluginId,
						}))}
					/>
					{gen !== undefined && (
						<>
							<Registry
								title="rules"
								rows={gen.rules.attributions().map((entry) => ({
									id: entry.entry.id,
									by: entry.pluginId,
								}))}
							/>
							<Registry
								title="skeletons"
								rows={gen.skeletons.attributions().map((entry) => ({
									id: entry.entry.id,
									by: entry.pluginId,
								}))}
							/>
							<Registry
								title="contentProviders"
								rows={gen.contentProviders.attributions().map((entry) => ({
									id: entry.entry.id,
									by: entry.pluginId,
								}))}
							/>
						</>
					)}
					<Registry
						title="services"
						rows={spire.services.keys().map((key) => ({ id: key, by: undefined }))}
					/>
				</div>
			)}

			<div className="block">
				<h3>StateDocument</h3>
				<p className="hint">保存されるのはこれだけ。状態は全部ここから導出している。</p>
				<pre className="mono json">{JSON.stringify(state, null, 2)}</pre>
			</div>
		</section>
	);
}

function Registry({
	title,
	rows,
}: {
	title: string;
	rows: readonly { id: string; by: string | undefined }[];
}): ReactElement {
	return (
		<div className="registry">
			<span className="registry-title mono">{title}</span>
			{rows.length === 0 ? (
				<span className="hint">（空）</span>
			) : (
				<ul className="mono">
					{rows.map((row) => (
						<li key={row.id}>
							{row.id}
							<span className="by">{row.by ?? "builtin"}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
