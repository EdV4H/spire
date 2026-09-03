import type { Spire } from "@edv4h/spire-core";
import { createRejectionAssigner } from "./assign/rejection.js";
import { createGenRegistries, type GenRegistries, getGenRegistries } from "./registries.js";
import { builtInRules } from "./rules/built-in.js";
import { createStsWalksAlgorithm } from "./skeleton/sts-walks.js";

/**
 * The registries an operation should use: the Spire's, if one was passed and it
 * loaded the generation plugin, otherwise a fresh built-in-only set.
 *
 * The fallback is what lets `generate(spec)` work with no setup at all for a
 * spec that names nothing custom — which is the common case, and not worth
 * making a host build a Spire for.
 */
export function resolveRegistries(spire: Spire | undefined): GenRegistries {
	if (spire !== undefined) {
		const registered = getGenRegistries(spire);
		if (registered !== undefined) return registered;
	}

	const registries = createGenRegistries();
	for (const rule of builtInRules()) registries.rules.register(rule);
	registries.skeletons.register(createStsWalksAlgorithm());
	registries.assigners.register(createRejectionAssigner());
	return registries;
}
