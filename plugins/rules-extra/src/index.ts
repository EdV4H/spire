import { SPIRE_PLUGIN_API_VERSION, type SpirePlugin } from "@edv4h/spire-core";
import { GEN_PLUGIN_ID, getGenRegistries } from "@edv4h/spire-gen";
import { extraRules } from "./rules.js";

export const RULES_EXTRA_PLUGIN_ID = "@edv4h/spire-plugin-rules-extra";

/**
 * Adds `maxTotal`, `rowRange` and `afterTypes` to the constraint vocabulary.
 *
 * Note what this plugin does *not* do: it does not import anything internal, it
 * does not patch the generator, and it does not need the SDK to know it exists.
 * It declares a dependency on the generation plugin, resolves that plugin's
 * registries through the service seam, and registers. A rule written inside an
 * application looks exactly like this.
 */
export function createRulesExtraPlugin(): SpirePlugin {
	return {
		id: RULES_EXTRA_PLUGIN_ID,
		name: "Extra constraint rules",
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		dependencies: [GEN_PLUGIN_ID],
		setup(ctx) {
			const registries = getGenRegistries(ctx.services);
			if (registries === undefined) {
				// Unreachable while the dependency above is declared, and the
				// kernel refuses a missing dependency before setup runs.
				throw new Error(
					`${RULES_EXTRA_PLUGIN_ID} requires ${GEN_PLUGIN_ID}, whose registries are not available.`,
				);
			}

			const offs = extraRules().map((rule) => registries.rules.register(rule));
			return () => {
				for (const off of offs.reverse()) off();
			};
		},
	};
}

export { afterTypesRule, extraRules, maxTotalRule, rowRangeRule } from "./rules.js";
