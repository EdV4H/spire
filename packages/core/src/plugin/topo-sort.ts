import { type PluginError, pluginError } from "./errors.js";
import type { SpirePlugin } from "./plugin.js";

/**
 * Order plugins so every dependency is set up before its dependents.
 *
 * Kahn's algorithm with an input-order ready queue, so the result is
 * deterministic: independent plugins keep the order the host listed them in.
 * Missing and cyclic dependencies are reported rather than silently tolerated —
 * uSketch has no dependency mechanism at all and manages ordering with prose
 * comments in the host's plugin array, which is exactly the failure mode this
 * avoids.
 */
export function topoSortPlugins(plugins: readonly SpirePlugin[]): {
	ordered: SpirePlugin[];
	errors: PluginError[];
} {
	const errors: PluginError[] = [];
	const byId = new Map<string, SpirePlugin>();

	for (const plugin of plugins) {
		if (byId.has(plugin.id)) {
			errors.push(
				pluginError("duplicate_plugin_id", `Two plugins declare the id "${plugin.id}".`, {
					pluginId: plugin.id,
				}),
			);
			continue;
		}
		byId.set(plugin.id, plugin);
	}

	const remaining = new Map<string, number>();
	const dependents = new Map<string, string[]>();

	for (const plugin of byId.values()) {
		let indegree = 0;
		for (const dep of plugin.dependencies ?? []) {
			if (!byId.has(dep)) {
				errors.push(
					pluginError(
						"missing_dependency",
						`Plugin "${plugin.id}" depends on "${dep}", which is not in the plugin list.`,
						{ pluginId: plugin.id, meta: { dependency: dep } },
					),
				);
				continue;
			}
			indegree += 1;
			const list = dependents.get(dep);
			if (list === undefined) {
				dependents.set(dep, [plugin.id]);
			} else {
				list.push(plugin.id);
			}
		}
		remaining.set(plugin.id, indegree);
	}

	// Seed in input order so the output is stable across runs.
	const queue: string[] = [];
	for (const plugin of byId.values()) {
		if (remaining.get(plugin.id) === 0) queue.push(plugin.id);
	}

	const ordered: SpirePlugin[] = [];
	while (queue.length > 0) {
		const id = queue.shift() as string;
		const plugin = byId.get(id);
		if (plugin !== undefined) ordered.push(plugin);
		for (const dependentId of dependents.get(id) ?? []) {
			const next = (remaining.get(dependentId) ?? 0) - 1;
			remaining.set(dependentId, next);
			if (next === 0) queue.push(dependentId);
		}
	}

	if (ordered.length !== byId.size) {
		const stuck = [...byId.keys()].filter((id) => !ordered.some((p) => p.id === id));
		errors.push(
			pluginError(
				"cyclic_dependency",
				`Plugin dependencies form a cycle involving: ${stuck.join(", ")}.`,
				{ meta: { plugins: stuck } },
			),
		);
	}

	return { ordered, errors };
}
