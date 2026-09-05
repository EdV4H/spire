import { SPIRE_PLUGIN_API_VERSION, type SpirePlugin } from "@edv4h/spire-core";
import { createRejectionAssigner } from "./assign/rejection.js";
import { type ContentProvider, createGenRegistries, genService } from "./registries.js";
import { builtInRules } from "./rules/built-in.js";
import { createStsWalksAlgorithm } from "./skeleton/sts-walks.js";

export const GEN_PLUGIN_ID = "@edv4h/spire-gen";

export interface GenPluginOptions {
	/**
	 * Content providers to register up front. A provider is code — usually an
	 * LLM call — so it cannot live in the GenSpec; the spec names it by id and
	 * the host supplies the implementation here.
	 */
	contentProviders?: readonly ContentProvider[];
	/** Whole-map attempts the rejection assigner makes before giving up. */
	maxAssignAttempts?: number;
}

/**
 * Registers generation's four registries and their built-in entries.
 *
 * Generation is itself a plugin rather than a hard-wired part of the kernel,
 * which is the honest arrangement: a host that only reads and validates stored
 * maps has no reason to carry a map generator, and a host that wants a
 * different skeleton algorithm replaces this plugin rather than forking the
 * SDK.
 */
export function createGenPlugin(options: GenPluginOptions = {}): SpirePlugin {
	return {
		id: GEN_PLUGIN_ID,
		name: "Spire generation",
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		setup(ctx) {
			const registries = createGenRegistries();

			for (const rule of builtInRules()) registries.rules.register(rule);
			registries.skeletons.register(createStsWalksAlgorithm());
			registries.assigners.register(
				createRejectionAssigner(
					options.maxAssignAttempts === undefined ? {} : { maxAttempts: options.maxAssignAttempts },
				),
			);
			for (const provider of options.contentProviders ?? []) {
				registries.contentProviders.register(provider);
			}

			// The registries are handed out unscoped: a plugin that adds a rule
			// registers it through this same object, and its attribution comes
			// from the registry it calls, not from who owns the service.
			return genService.provide(ctx.services, registries);
		},
	};
}
