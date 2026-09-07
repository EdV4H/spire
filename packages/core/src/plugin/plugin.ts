import type { z } from "zod";
import type { MapDocument, NodeId, NodeStatus, NodeTypeId, StateDocument } from "../types.js";
import type { ValidationError } from "../validate/errors.js";
import type { EventBus } from "./event-bus.js";
import type { Registry } from "./registry.js";
import type { ServiceRegistry } from "./service.js";

/**
 * Plugin API major version. A plugin declares the version it was built against
 * and the kernel refuses a mismatch, rather than letting it half-work.
 */
export const SPIRE_PLUGIN_API_VERSION = 1;

export type PluginTeardown = () => void | Promise<void>;

/**
 * The whole plugin contract: an id, a name, and `setup`.
 *
 * There is deliberately **no kind discriminant**. What a plugin *is* — a rule
 * pack, a policy, a node-type vocabulary — follows from which registries its
 * `setup` touches. uSketch's design document promised a
 * `type: "tool" | "shape" | …` field, never implemented it, and did not miss it.
 *
 * Two rules for authors:
 *
 * 1. **Always produce a plugin from a factory function** (`createXxxPlugin()`),
 *    never export a module-level singleton. Two `createSpire` calls in one
 *    process must not share instance state.
 * 2. **Return the teardown from `setup`.** Stashing it on `this` means a second
 *    `setup` overwrites the first instance's closure, and the first instance's
 *    `destroy()` then tears down the live second one.
 */
export interface SpirePlugin {
	readonly id: string;
	readonly name: string;
	readonly apiVersion: typeof SPIRE_PLUGIN_API_VERSION;
	/**
	 * Ids of plugins that must be set up first. The kernel topologically sorts
	 * on these and reports missing or cyclic dependencies as errors — array
	 * order is *not* the dependency graph.
	 */
	readonly dependencies?: readonly string[];
	/**
	 * The `void` in the union is deliberate: a plugin either returns a teardown
	 * or returns nothing at all. `undefined` would force an explicit
	 * `return undefined` on every plugin with nothing to clean up.
	 */
	// biome-ignore lint/suspicious/noConfusingVoidType: see the note above.
	setup(ctx: PluginContext): PluginTeardown | void | Promise<PluginTeardown | void>;
}

/** Read-only view of the loaded plugins. */
export interface PluginInfoRegistry {
	getAll(): readonly { id: string; name: string }[];
	has(id: string): boolean;
}

// ── Core extension points ────────────────────────────────────────────────────

/**
 * A node type's *implementation* side. The map document only carries the type
 * id; registering a definition lets the SDK validate `node.data` and lets a
 * renderer look up presentation metadata. Registering is always optional — an
 * unregistered type is still valid, just unvalidated.
 */
export interface NodeTypeDefinition {
	readonly id: NodeTypeId;
	/** Schema for `node.data` of this type. The SDK never reads inside `data`. */
	readonly dataSchema?: z.ZodType;
	/** Host-defined presentation metadata (label, icon key, …). Passed through. */
	readonly meta?: Record<string, unknown>;
}

export interface ValidateContext {
	readonly map: MapDocument;
	readonly nodeTypes: Registry<NodeTypeDefinition>;
}

/** An extra structural check run by `validateMap` alongside the built-in ones. */
export interface MapValidator {
	readonly id: string;
	/** Lower runs first. Defaults to 0. */
	readonly order?: number;
	validate(ctx: ValidateContext): readonly ValidationError[];
}

export interface PolicyContext {
	readonly map: MapDocument;
	readonly state: StateDocument;
	readonly nodeId: NodeId;
	/** The node's status before the attempted transition. */
	readonly status: NodeStatus;
}

/**
 * Decides whether a node may be completed. `single-route` (the default: one
 * unbroken path), `strict` (reachable only, every branch walkable) and `free`
 * (any node) are built in; anything else — quorum rules, time windows, role
 * checks — arrives as a plugin and is selected by id, so a host's configuration
 * JSON can name a policy without shipping code.
 */
export interface ProgressionPolicyDefinition {
	readonly id: string;
	canComplete(ctx: PolicyContext): boolean;
}

/** A single-step `smfVersion` upgrade. */
export interface Migration {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	migrate(doc: unknown): unknown;
}

/**
 * What a plugin gets. Every field is a registry or a bus — the kernel holds no
 * document state of its own, which is what keeps `createSpire` cheap enough to
 * call per operation if a host wants to.
 */
export interface PluginContext {
	readonly nodeTypes: Registry<NodeTypeDefinition>;
	readonly validators: Registry<MapValidator>;
	readonly policies: Registry<ProgressionPolicyDefinition>;
	readonly migrations: Registry<Migration>;
	readonly events: EventBus;
	/** Generic IoC map. Feature-specific registries live here (see `defineService`). */
	readonly services: ServiceRegistry;
	readonly plugins: PluginInfoRegistry;
}
