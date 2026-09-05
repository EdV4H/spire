import type { MapDocument, Spire } from "@edv4h/spire-core";
import { resolveNodeStyle } from "@edv4h/spire-render";
import type { ReactElement } from "react";
import { playgroundTheme } from "../theme.js";

/**
 * Which node types are in play, and where each one comes from.
 *
 * The SDK ships **no** node types — a type is an opaque, host-defined string,
 * and nothing in `@edv4h/spire-core` knows what a `gate` is. What exists is
 * three independent layers, and separating them is the point of the design, so
 * this panel keeps them separate rather than merging them into one list:
 *
 * 1. **Declared** — `map.nodeTypes`. The vocabulary this document uses. The
 *    only layer the format requires; the validator rejects a node whose type is
 *    not declared here.
 * 2. **Defined** — a `NodeTypeDefinition` in the `nodeTypes` registry. Optional,
 *    contributed by a plugin, and what lets `validateMap` check `node.data`.
 *    An undeclared-but-registered type is fine; so is the reverse.
 * 3. **Styled** — an entry in the theme. Also optional, also the host's, which
 *    is why the SDK's own theme is a single neutral colour.
 */

interface Props {
	spire: Spire | undefined;
	map: MapDocument | undefined;
}

interface TypeRow {
	id: string;
	/** Declared in `map.nodeTypes`. */
	declared: boolean;
	/** How many nodes of this type the map actually has. */
	count: number;
	/** Plugin that registered a definition, `null` for a host registration. */
	definedBy: string | null | undefined;
	/** `meta.label` from the definition, if it carries one. */
	label: string | undefined;
	hasSchema: boolean;
	styled: boolean;
	fill: string;
	stroke: string;
}

export function NodeTypes({ spire, map }: Props): ReactElement {
	const rows = collect(spire, map);

	return (
		<div className="block">
			<h3>ノードタイプ</h3>
			<p className="hint">
				SDK は種類を1つも持たない。タイプは利用者が決める不透明な文字列で、
				下の3列は「マップが宣言した」「プラグインが定義した」「テーマが色を与えた」の別。
			</p>

			{rows.length === 0 ? (
				<p className="hint">まだマップが無く、登録されたタイプも無い。</p>
			) : (
				<ul className="typelist">
					{rows.map((row) => (
						<li key={row.id}>
							<span
								className="swatch"
								style={{ background: row.fill, borderColor: row.stroke }}
								aria-hidden="true"
							/>
							<span className="mono type-id">{row.id}</span>
							{row.label !== undefined && <span className="type-label">{row.label}</span>}
							<span className="type-count mono">{row.declared ? row.count : "—"}</span>
							<span className="type-tags">
								{row.definedBy !== undefined && (
									<span className="tag" title={`定義: ${row.definedBy ?? "host"}`}>
										{row.hasSchema ? "schema" : "定義"}
									</span>
								)}
								{!row.declared && (
									<span className="tag tag--muted" title="レジストリにはあるがマップは使っていない">
										未使用
									</span>
								)}
								{!row.styled && (
									<span
										className="tag tag--muted"
										title="テーマに専用の色が無く default で描かれる"
									>
										既定色
									</span>
								)}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function collect(spire: Spire | undefined, map: MapDocument | undefined): TypeRow[] {
	const counts = new Map<string, number>();
	for (const node of map?.nodes ?? []) {
		counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
	}

	const declared = new Set((map?.nodeTypes ?? []).map((type) => type.id));
	const definitions = spire?.nodeTypes.attributions() ?? [];
	const definedIds = new Set(definitions.map((entry) => entry.entry.id));

	const ids = [...new Set([...declared, ...definedIds])].sort();

	return ids.map((id) => {
		const definition = definitions.find((entry) => entry.entry.id === id);
		// Ask the theme for the same style the map is drawn with, rather than
		// keeping a second copy of the palette in sync by hand.
		const style = resolveNodeStyle(playgroundTheme, id, "reachable");

		return {
			id,
			declared: declared.has(id),
			count: counts.get(id) ?? 0,
			definedBy: definition === undefined ? undefined : (definition.pluginId ?? null),
			label:
				typeof definition?.entry.meta?.label === "string" ? definition.entry.meta.label : undefined,
			hasSchema: definition?.entry.dataSchema !== undefined,
			styled: playgroundTheme.node[id] !== undefined,
			fill: style.fill,
			stroke: style.stroke,
		};
	});
}
