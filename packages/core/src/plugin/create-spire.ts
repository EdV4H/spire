import { BUILTIN_POLICIES } from "../progress/policies.js";
import { err, ok, type Result } from "../result.js";
import { type PluginError, pluginError } from "./errors.js";
import { createEventBus } from "./event-bus.js";
import type {
	MapValidator,
	Migration,
	NodeTypeDefinition,
	PluginContext,
	PluginInfoRegistry,
	PluginTeardown,
	ProgressionPolicyDefinition,
	SpirePlugin,
} from "./plugin.js";
import { SPIRE_PLUGIN_API_VERSION } from "./plugin.js";
import { createRegistry } from "./registry.js";
import { createServiceRegistry } from "./service.js";
import { topoSortPlugins } from "./topo-sort.js";

/**
 * A configured Spire instance: the registries every plugin contributed to, plus
 * teardown. It holds no map or state document — those stay values the host
 * passes into the pure functions.
 */
export interface Spire extends PluginContext {
	/**
	 * Run every teardown in LIFO order. Idempotent. Returns whatever the
	 * teardowns threw instead of logging it.
	 */
	destroy(): Promise<readonly PluginError[]>;
	/** Registry conflicts recorded by registrations made after setup. */
	conflicts(): readonly PluginError[];
}

export interface CreateSpireOptions {
	plugins?: readonly SpirePlugin[];
}

/**
 * Build a Spire instance from a plugin list.
 *
 * Ordering and failure semantics, in one place:
 *
 * - Plugins are validated (api version, duplicate ids), topologically sorted on
 *   their declared `dependencies`, then set up **sequentially with `await`**.
 * - Each plugin sees a context scoped to its own id, so everything it registers
 *   is attributed automatically. The scoped registries are explicit method
 *   wrappers, not spreads, so kernel-only methods stay unreachable.
 * - After each `setup` the kernel drains registry conflicts. A conflict is
 *   treated exactly like a thrown `setup`.
 * - On any failure, teardowns collected so far run in LIFO order and the whole
 *   creation fails with every error found. Nothing is left half-registered.
 */
export async function createSpire(
	options: CreateSpireOptions = {},
): Promise<Result<Spire, PluginError[]>> {
	const plugins = options.plugins ?? [];

	const versionErrors: PluginError[] = [];
	for (const plugin of plugins) {
		if (plugin.apiVersion !== SPIRE_PLUGIN_API_VERSION) {
			versionErrors.push(
				pluginError(
					"api_version_mismatch",
					`Plugin "${plugin.id}" targets plugin API v${String(plugin.apiVersion)}, but this SDK provides v${SPIRE_PLUGIN_API_VERSION}.`,
					{ pluginId: plugin.id, meta: { expected: SPIRE_PLUGIN_API_VERSION } },
				),
			);
		}
	}

	const { ordered, errors: sortErrors } = topoSortPlugins(plugins);
	const setupBlockers = [...versionErrors, ...sortErrors];
	if (setupBlockers.length > 0) return err(setupBlockers);

	const nodeTypes = createRegistry<NodeTypeDefinition>("node type");
	const validators = createRegistry<MapValidator>("validator");
	const policies = createRegistry<ProgressionPolicyDefinition>("progression policy");
	const migrations = createRegistry<Migration>("migration");
	const events = createEventBus();
	const services = createServiceRegistry();

	for (const policy of BUILTIN_POLICIES) policies.register(policy);
	policies.drainConflicts();

	const loaded: { id: string; name: string }[] = [];
	const pluginInfo: PluginInfoRegistry = {
		getAll: () => loaded.map((p) => ({ ...p })),
		has: (id) => loaded.some((p) => p.id === id),
	};

	const registries = { nodeTypes, validators, policies, migrations } as const;
	const drainAllConflicts = (): PluginError[] => [
		...nodeTypes.drainConflicts(),
		...validators.drainConflicts(),
		...policies.drainConflicts(),
		...migrations.drainConflicts(),
	];

	const teardowns: { pluginId: string; teardown: PluginTeardown }[] = [];

	const runTeardowns = async (): Promise<PluginError[]> => {
		const failures: PluginError[] = [];
		for (const entry of [...teardowns].reverse()) {
			try {
				await entry.teardown();
			} catch (error) {
				failures.push(
					pluginError("teardown_failed", `Teardown of plugin "${entry.pluginId}" failed.`, {
						pluginId: entry.pluginId,
						cause: error,
					}),
				);
			}
		}
		teardowns.length = 0;
		return failures;
	};

	for (const plugin of ordered) {
		const scoped: PluginContext = {
			nodeTypes: registries.nodeTypes.scopedFor(plugin.id),
			validators: registries.validators.scopedFor(plugin.id),
			policies: registries.policies.scopedFor(plugin.id),
			migrations: registries.migrations.scopedFor(plugin.id),
			events,
			services,
			plugins: pluginInfo,
		};

		let failure: PluginError | undefined;
		try {
			const teardown = await plugin.setup(scoped);
			if (typeof teardown === "function") teardowns.push({ pluginId: plugin.id, teardown });
			loaded.push({ id: plugin.id, name: plugin.name });
		} catch (error) {
			failure = pluginError("setup_failed", `Setup of plugin "${plugin.id}" failed.`, {
				pluginId: plugin.id,
				cause: error,
			});
		}

		const conflicts = drainAllConflicts();
		if (failure !== undefined || conflicts.length > 0) {
			const rollbackFailures = await runTeardowns();
			const all = failure === undefined ? [] : [failure];
			return err([...all, ...conflicts, ...rollbackFailures]);
		}
	}

	let destroyed = false;
	const spire: Spire = {
		nodeTypes,
		validators,
		policies,
		migrations,
		events,
		services,
		plugins: pluginInfo,
		conflicts: () => [
			...nodeTypes.conflicts(),
			...validators.conflicts(),
			...policies.conflicts(),
			...migrations.conflicts(),
		],
		async destroy() {
			if (destroyed) return [];
			destroyed = true;
			return runTeardowns();
		},
	};

	return ok(spire);
}
