import {
	createRegistry,
	defineService,
	type NodeId,
	type NodeTypeId,
	type PluginError,
	type Registry,
	type Result,
	type Rng,
	type ServiceRegistry,
	type Spire,
} from "@edv4h/spire-core";
import type { z } from "zod";
import type { GenSpec } from "./spec.js";

/**
 * Generation's four extension points.
 *
 * They live here rather than on `PluginContext` because the kernel has no
 * business knowing what a generation rule is — `@edv4h/spire-core` must stay
 * usable by a host that only reads and validates maps. They reach plugins
 * through `ctx.services`, which is exactly what that seam is for.
 *
 * Everything is addressed by string id, and that is the point: a GenSpec names
 * a skeleton algorithm, an assigner, its rules and its content provider by id,
 * so the whole spec stays JSON. A spec with an injected predicate function
 * could not be stored, shared, or replayed — and the design document requires
 * that a GenSpec be serialisable as a reusable template.
 */

// ── Constraint rules ─────────────────────────────────────────────────────────

export interface RuleContext {
	/** The node being considered. */
	readonly nodeId: NodeId;
	/** The type under consideration for it. */
	readonly candidateType: NodeTypeId;
	/** Grid position of the node. */
	readonly position: { col: number; row: number };
	/** Last row index of the grid, so `row: -1` rules can resolve it. */
	readonly terminalRow: number;
	/** Types already decided. Nodes not yet assigned are absent. */
	readonly assigned: ReadonlyMap<NodeId, NodeTypeId>;
	/** Direct predecessors of the node. */
	readonly predecessors: readonly NodeId[];
	/** Direct successors of the node. */
	readonly successors: readonly NodeId[];
	/** Siblings sharing a predecessor with this node, excluding itself. */
	readonly siblings: readonly NodeId[];
	/** Grid position of any node in the skeleton. */
	positionOf(nodeId: NodeId): { col: number; row: number } | undefined;
	/**
	 * The rule's own parameters. Already validated against the rule's
	 * `paramsSchema` by the caller, so `evaluate` can read them directly rather
	 * than re-parsing once per candidate.
	 */
	readonly params: Record<string, unknown>;
}

export interface RuleVerdict {
	allowed: boolean;
	/** Why the candidate was rejected. Surfaced in `UnsatisfiableSpec` errors. */
	reason?: string;
}

/**
 * A constraint on type assignment.
 *
 * The same `evaluate` is called by the generator, to filter candidate types,
 * and by `validateConstraints`, to re-check a map a host has edited. One
 * implementation, so a hand-edited map is held to exactly the same standard as
 * a generated one.
 */
export interface ConstraintRule {
	readonly id: string;
	/** Schema for this rule's entry in `types.constraints`. */
	readonly paramsSchema?: z.ZodType;
	evaluate(ctx: RuleContext): RuleVerdict;
	/**
	 * Type ids this rule *places* on the map, beyond what
	 * `types.distribution` weights.
	 *
	 * A rule like `fixedRow` pins the terminal row to a `"final"` type that no
	 * host wants sprinkled through the rest of the map by a weight. Declaring it
	 * here adds it to the candidate pool without adding it to the distribution,
	 * so the pinning rule stays the only thing that decides where it lands.
	 */
	contributesTypes?(params: Record<string, unknown>): readonly NodeTypeId[];
}

// ── Skeleton algorithms ──────────────────────────────────────────────────────

export interface SkeletonNode {
	id: NodeId;
	position: { col: number; row: number };
}

export interface SkeletonEdge {
	id: string;
	from: NodeId;
	to: NodeId;
}

export interface Skeleton {
	grid: { cols: number; rows: number };
	nodes: SkeletonNode[];
	edges: SkeletonEdge[];
}

export interface SkeletonAlgorithm {
	readonly id: string;
	readonly paramsSchema?: z.ZodType;
	generate(params: Record<string, unknown>, rng: Rng): Result<Skeleton, SkeletonFailure>;
}

export interface SkeletonFailure {
	code: "invalid_params" | "impossible";
	message: string;
	meta?: Record<string, unknown>;
}

// ── Type assigners ───────────────────────────────────────────────────────────

export interface AssignInput {
	skeleton: Skeleton;
	spec: GenSpec;
	rules: Registry<ConstraintRule>;
	rng: Rng;
	/**
	 * Types that are already decided and must not change.
	 *
	 * `regenerate` uses this to hold completed nodes fixed while reshuffling the
	 * rest. An assigner must treat these as given — including when they violate
	 * a constraint, because the map they came from is history, not a proposal.
	 */
	pinned?: ReadonlyMap<NodeId, NodeTypeId>;
}

export interface AssignFailure {
	code: "unsatisfiable" | "unknown_rule" | "invalid_params";
	message: string;
	meta?: Record<string, unknown>;
}

export interface TypeAssigner {
	readonly id: string;
	assign(input: AssignInput): Result<Map<NodeId, NodeTypeId>, AssignFailure>;
}

// ── Content providers ────────────────────────────────────────────────────────

/**
 * What a provider is told about a node. Structure only — no map, no other
 * nodes' content, and nothing domain-specific. A provider that wants to call an
 * LLM builds its own prompt from this; the SDK never learns what the nodes
 * mean.
 */
export interface NodeSlot {
	nodeId: NodeId;
	type: NodeTypeId;
	row: number;
	col: number;
	/** Ids of the nodes this one branches alongside, if any. */
	branchGroup?: readonly NodeId[];
}

export interface NodeContent {
	nodeId: NodeId;
	data: Record<string, unknown>;
}

export interface ContentProvider {
	readonly id: string;
	provide(slots: readonly NodeSlot[]): Promise<readonly NodeContent[]>;
}

// ── The registries, reached through services ─────────────────────────────────

export interface GenRegistries {
	readonly rules: Registry<ConstraintRule>;
	readonly skeletons: Registry<SkeletonAlgorithm>;
	readonly assigners: Registry<TypeAssigner>;
	readonly contentProviders: Registry<ContentProvider>;
	/**
	 * Duplicate-id registrations recorded across all four registries.
	 *
	 * The kernel drains conflicts for the registries it owns, but it cannot see
	 * these — so `generate` checks them itself and refuses to run rather than
	 * quietly using whichever rule happened to register first.
	 */
	conflicts(): readonly PluginError[];
}

/**
 * Service key for the generation registries. A rule plugin depends on
 * `@edv4h/spire-gen` for this handle and for the `ConstraintRule` type, and on
 * nothing else.
 */
export const genService = defineService<GenRegistries>("@edv4h/spire-gen");

export interface InternalGenRegistries extends GenRegistries {
	scopedFor(pluginId: string): GenRegistries;
}

export function createGenRegistries(): InternalGenRegistries {
	const rules = createRegistry<ConstraintRule>("constraint rule");
	const skeletons = createRegistry<SkeletonAlgorithm>("skeleton algorithm");
	const assigners = createRegistry<TypeAssigner>("type assigner");
	const contentProviders = createRegistry<ContentProvider>("content provider");

	const conflicts = (): readonly PluginError[] => [
		...rules.conflicts(),
		...skeletons.conflicts(),
		...assigners.conflicts(),
		...contentProviders.conflicts(),
	];

	return {
		rules,
		skeletons,
		assigners,
		contentProviders,
		conflicts,
		scopedFor: (pluginId) => ({
			rules: rules.scopedFor(pluginId),
			skeletons: skeletons.scopedFor(pluginId),
			assigners: assigners.scopedFor(pluginId),
			contentProviders: contentProviders.scopedFor(pluginId),
			conflicts,
		}),
	};
}

/**
 * Resolve the generation registries a Spire was built with. Returns `undefined`
 * when `createGenPlugin()` was not among its plugins, which is what lets
 * `generate` tell a host exactly what is missing.
 */
export function getGenRegistries(spire: Spire | ServiceRegistry): GenRegistries | undefined {
	const services = "services" in spire ? spire.services : spire;
	return genService.get(services);
}
