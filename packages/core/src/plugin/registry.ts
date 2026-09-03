import { type PluginError, pluginError } from "./errors.js";

/**
 * The one registry implementation every extension point is built from — in
 * `@edv4h/spire-core` and, via `createRegistry`, in `@edv4h/spire-gen` and any
 * third-party package. Having a single implementation is what makes the
 * conflict, attribution and stale-unregister semantics uniform.
 *
 * Three deliberate choices, each a fix for something that bit uSketch:
 *
 * - **`register` returns the unregister closure directly, not a `Result`.**
 *   Straight-line plugin code stays readable. A conflicting registration is a
 *   no-op and is recorded in `conflicts()`; `createSpire` drains that list
 *   after each `setup` and fails the whole creation, so a duplicate id can
 *   never silently replace an incumbent (uSketch's `map.set` did exactly that).
 * - **Unregistering is guarded against staleness.** A closure only removes the
 *   entry it registered, so a late `off()` from a torn-down plugin cannot
 *   clobber a re-registration under the same id.
 * - **`getAll` returns a copy.** A `ReadonlyMap` return type is erased at
 *   runtime; handing out the live map invites a cast-and-mutate that bypasses
 *   registration entirely.
 */

export type Unregister = () => void;

export interface HasId {
	readonly id: string;
}

export interface RegisterOptions {
	/**
	 * Replace an existing entry with the same id instead of recording a
	 * conflict. Opt-in, so overriding is always visible at the call site.
	 */
	override?: boolean;
}

export interface Attribution<T> {
	/** The plugin that registered the entry, or `undefined` for a host registration. */
	readonly pluginId: string | undefined;
	readonly entry: T;
}

/** The surface a plugin or host sees. */
export interface Registry<T extends HasId> {
	register(entry: T, options?: RegisterOptions): Unregister;
	unregister(id: string): void;
	get(id: string): T | undefined;
	has(id: string): boolean;
	/** Defensive copy of the whole registry. */
	getAll(): ReadonlyMap<string, T>;
	/** Ids in registration order. */
	ids(): readonly string[];
	/** Entries paired with the plugin that registered them. */
	attributions(): readonly Attribution<T>[];
	/** Conflicts recorded since the last `drainConflicts`. */
	conflicts(): readonly PluginError[];
}

/** The kernel-only surface. Never handed to a plugin. */
export interface InternalRegistry<T extends HasId> extends Registry<T> {
	registerFor(pluginId: string | undefined, entry: T, options?: RegisterOptions): Unregister;
	/** Returns and clears the recorded conflicts. */
	drainConflicts(): readonly PluginError[];
	/**
	 * A view whose `register` attributes entries to `pluginId`. Built from
	 * explicit method wrappers rather than a spread, so `registerFor` and
	 * `drainConflicts` are not reachable from a plugin even through a cast.
	 */
	scopedFor(pluginId: string): Registry<T>;
}

export function createRegistry<T extends HasId>(kind: string): InternalRegistry<T> {
	const entries = new Map<string, Attribution<T>>();
	let conflicts: PluginError[] = [];

	const registerFor = (
		pluginId: string | undefined,
		entry: T,
		options: RegisterOptions = {},
	): Unregister => {
		const existing = entries.get(entry.id);
		if (existing !== undefined && options.override !== true) {
			conflicts.push(
				pluginError(
					"registry_conflict",
					`${kind} "${entry.id}" is already registered${
						existing.pluginId === undefined ? "" : ` by ${existing.pluginId}`
					}. Pass { override: true } to replace it deliberately.`,
					{
						...(pluginId === undefined ? {} : { pluginId }),
						meta: { kind, id: entry.id, existingPluginId: existing.pluginId },
					},
				),
			);
			return () => {};
		}

		const attribution: Attribution<T> = { pluginId, entry };
		entries.set(entry.id, attribution);

		return () => {
			// Stale guard: only remove the entry this call installed.
			if (entries.get(entry.id) === attribution) entries.delete(entry.id);
		};
	};

	const registry: InternalRegistry<T> = {
		registerFor,
		register(entry, options) {
			return registerFor(undefined, entry, options);
		},
		unregister(id) {
			entries.delete(id);
		},
		get(id) {
			return entries.get(id)?.entry;
		},
		has(id) {
			return entries.has(id);
		},
		getAll() {
			const copy = new Map<string, T>();
			for (const [id, attribution] of entries) copy.set(id, attribution.entry);
			return copy;
		},
		ids() {
			return [...entries.keys()];
		},
		attributions() {
			return [...entries.values()];
		},
		conflicts() {
			return [...conflicts];
		},
		drainConflicts() {
			const drained = conflicts;
			conflicts = [];
			return drained;
		},
		scopedFor(pluginId) {
			return {
				register: (entry, options) => registerFor(pluginId, entry, options),
				unregister: registry.unregister,
				get: registry.get,
				has: registry.has,
				getAll: registry.getAll,
				ids: registry.ids,
				attributions: registry.attributions,
				conflicts: registry.conflicts,
			};
		},
	};

	return registry;
}
