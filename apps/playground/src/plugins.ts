import { SPIRE_PLUGIN_API_VERSION, type SpirePlugin } from "@edv4h/spire-core";
import { type ContentProvider, createGenPlugin } from "@edv4h/spire-gen";
import { createQuorumPolicyPlugin } from "@edv4h/spire-plugin-policy-quorum";
import { createRulesExtraPlugin } from "@edv4h/spire-plugin-rules-extra";
import { createRenderPlugin } from "@edv4h/spire-render";
import { EDGE_RENDERERS, LAYERS, NODE_RENDERERS } from "./renderers.js";

/**
 * The plugins the playground can load, each behind a toggle.
 *
 * Toggling is the point: turning off the generation plugin while a rule plugin
 * that depends on it is on shows the kernel reporting a missing dependency
 * instead of half-starting, and turning off `rules-extra` makes a spec that
 * names one of its rules fail with the rule's name in the message. Both are
 * easier to believe when you can do them than when you read about them.
 */

/** A provider a spec can name as `"playground:titles"`. */
const titlesProvider: ContentProvider = {
	id: "playground:titles",
	provide: async (slots) =>
		slots.map((slot) => ({
			nodeId: slot.nodeId,
			data: {
				title: `${slot.type} · row ${slot.row}`,
				lane: slot.col,
				...(slot.branchGroup === undefined ? {} : { branchOf: slot.branchGroup.length }),
			},
		})),
};

/**
 * A plugin written inline, to show that a plugin is just an object — nothing
 * about the extension seam requires a package.
 */
function createInlineDemoPlugin(): SpirePlugin {
	return {
		id: "playground:inline",
		name: "Inline demo",
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		setup(ctx) {
			const off = ctx.policies.register({
				id: "row-order",
				canComplete: (policyCtx) => {
					// Nothing may be completed before everything on earlier rows is.
					const node = policyCtx.map.nodes.find((n) => n.id === policyCtx.nodeId);
					if (node === undefined) return false;
					return policyCtx.map.nodes
						.filter((other) => other.position.row < node.position.row)
						.every((other) => policyCtx.state.completed[other.id] !== undefined);
				},
			});
			return off;
		},
	};
}

/**
 * Definitions for the vocabulary the presets use.
 *
 * Declaring a type in `map.nodeTypes` is all the format requires; registering a
 * `NodeTypeDefinition` on top is optional and is what gives a type a label and,
 * where a host wants one, a schema for `node.data`. Registering them here keeps
 * the inspector's three layers all populated, so the difference between
 * "declared", "defined" and "styled" is visible rather than described.
 *
 * No `dataSchema` on purpose: attaching one would make every map without
 * matching `node.data` fail validation, which is a surprising default for a
 * playground. `examples/acme-plugin-demo` shows that path.
 */
function createNodeTypesPlugin(): SpirePlugin {
	const labels: Record<string, string> = {
		step: "ステップ",
		gate: "チェックポイント",
		bonus: "ボーナス",
		boss: "山場",
		final: "ゴール",
	};

	return {
		id: "playground:node-types",
		name: "Node type definitions",
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		setup(ctx) {
			const offs = Object.entries(labels).map(([id, label]) =>
				ctx.nodeTypes.register({ id, meta: { label } }),
			);
			return () => {
				for (const off of offs.reverse()) off();
			};
		},
	};
}

export interface PluginEntry {
	id: string;
	label: string;
	note: string;
	/** Plugin ids this one needs loaded first. */
	requires: readonly string[];
	create: () => SpirePlugin;
}

export const availablePlugins: readonly PluginEntry[] = [
	{
		id: "gen",
		label: "@edv4h/spire-gen",
		note: "生成の4レジストリと組み込みルール。外すと生成そのものが動かない。",
		requires: [],
		create: () => createGenPlugin({ contentProviders: [titlesProvider] }),
	},
	{
		id: "rules-extra",
		label: "@edv4h/spire-plugin-rules-extra",
		note: "maxTotal / rowRange / afterTypes を追加する。gen に依存を宣言している。",
		requires: ["gen"],
		create: () => createRulesExtraPlugin(),
	},
	{
		id: "node-types",
		label: "playground:node-types",
		note: "step / gate / bonus / boss / final に定義とラベルを与える。外すと nodeTypes レジストリが空になる。",
		requires: [],
		create: () => createNodeTypesPlugin(),
	},
	{
		id: "policy-quorum",
		label: "@edv4h/spire-plugin-policy-quorum",
		note: "「N 本の経路が合流したら開く」ポリシー。合流ノードで効き方が変わる。",
		requires: [],
		create: () => createQuorumPolicyPlugin({ threshold: 2 }),
	},
	{
		id: "inline",
		label: "playground:inline",
		note: "アプリ内で直接書いたプラグイン。row-order ポリシーを足す。",
		requires: [],
		create: () => createInlineDemoPlugin(),
	},
	{
		id: "renderers",
		label: "@edv4h/spire-render",
		note: "描画のレジストリと、ノード / エッジ / レイヤのデモ実装。外すと下の「描画」がすべて既定に戻る。",
		requires: [],
		create: () =>
			createRenderPlugin({
				nodeRenderers: NODE_RENDERERS,
				edgeRenderers: EDGE_RENDERERS,
				layers: LAYERS,
			}),
	},
];

export const defaultEnabled = [
	"gen",
	"rules-extra",
	"node-types",
	"policy-quorum",
	"inline",
	"renderers",
];
