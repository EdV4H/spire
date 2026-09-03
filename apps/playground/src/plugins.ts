import { SPIRE_PLUGIN_API_VERSION, type SpirePlugin } from "@edv4h/spire-core";
import { type ContentProvider, createGenPlugin } from "@edv4h/spire-gen";
import { createQuorumPolicyPlugin } from "@edv4h/spire-plugin-policy-quorum";
import { createRulesExtraPlugin } from "@edv4h/spire-plugin-rules-extra";

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
];

export const defaultEnabled = ["gen", "rules-extra", "policy-quorum", "inline"];
