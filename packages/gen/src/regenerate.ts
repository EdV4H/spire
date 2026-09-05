import {
	createRng,
	err,
	type MapDocument,
	type NodeId,
	type NodeTypeId,
	ok,
	type Result,
	type Spire,
	type StateDocument,
	validateMap,
} from "@edv4h/spire-core";
import { candidatePool } from "./assign/rejection.js";
import type { GenError } from "./generate.js";
import { buildSlots, populate } from "./populate.js";
import type { Skeleton } from "./registries.js";
import { resolveRegistries } from "./resolve-registries.js";
import { type GenSpec, type GenSpecInput, genSpecSchema } from "./spec.js";
import { validateConstraints } from "./validate.js";

/**
 * Reshuffle the parts of a map nobody has completed yet.
 *
 * **Scope, stated plainly:** this regenerates *type assignment*, not structure.
 * The grid, the nodes and the edges are carried over from the existing map;
 * completed nodes keep their type and their `data`; everything else is assigned
 * again under the new spec's distribution and constraints.
 *
 * That is the tractable half of "the plan changed mid-flight". Regenerating the
 * *shape* of the uncompleted region while keeping a completed prefix means
 * splicing two skeletons without introducing a crossing or a dead end, and
 * there is no honest way to do that in v0.1 — so it is not attempted here
 * rather than half-done.
 */

export interface RegenerateOptions {
	/** Progress to preserve. Completed nodes keep their type and data. */
	keepCompleted: StateDocument;
	spire?: Spire;
}

export async function regenerate(
	map: MapDocument,
	specInput: GenSpecInput,
	options: RegenerateOptions,
): Promise<Result<MapDocument, GenError>> {
	const parsed = genSpecSchema.safeParse(specInput);
	if (!parsed.success) {
		return err({
			code: "invalid_spec",
			message: `Invalid GenSpec: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
		});
	}
	const spec = parsed.data as GenSpec;

	if (spec.skeleton.grid.cols !== map.grid.cols || spec.skeleton.grid.rows !== map.grid.rows) {
		return err({
			code: "invalid_spec",
			message: `regenerate keeps the existing structure, so the spec's grid (${spec.skeleton.grid.cols}x${spec.skeleton.grid.rows}) must match the map's (${map.grid.cols}x${map.grid.rows}). Call generate() for a different shape.`,
			meta: { specGrid: spec.skeleton.grid, mapGrid: map.grid },
		});
	}

	const registries = resolveRegistries(options.spire);
	const conflicts = registries.conflicts();
	if (conflicts.length > 0) {
		return err({
			code: "registry_conflict",
			message: `Generation registries have conflicting registrations: ${conflicts.map((c) => c.message).join(" ")}`,
			meta: { conflicts },
		});
	}

	const assigner = registries.assigners.get(spec.types.assigner);
	if (assigner === undefined) {
		return err({
			code: "unknown_assigner",
			message: `Type assigner "${spec.types.assigner}" is not registered.`,
			meta: { assigner: spec.types.assigner, available: registries.assigners.ids() },
		});
	}

	const skeleton: Skeleton = {
		grid: map.grid,
		nodes: map.nodes.map((node) => ({ id: node.id, position: node.position })),
		edges: map.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
	};

	const pinned = new Map<NodeId, NodeTypeId>();
	for (const node of map.nodes) {
		if (options.keepCompleted.completed[node.id] !== undefined) pinned.set(node.id, node.type);
	}

	const assigned = assigner.assign({
		skeleton,
		spec,
		rules: registries.rules,
		rng: createRng(spec.seed),
		pinned,
	});
	if (!assigned.ok) {
		return err({
			code: "assign_failed",
			message: assigned.error.message,
			...(assigned.error.meta === undefined ? {} : { meta: assigned.error.meta }),
		});
	}

	// Only nodes that were reassigned get new content; a completed node's data is
	// a record of what someone actually did and is never overwritten.
	const content = new Map<NodeId, Record<string, unknown>>();
	if (spec.populate !== null) {
		const provider = registries.contentProviders.get(spec.populate);
		if (provider === undefined) {
			return err({
				code: "unknown_provider",
				message: `Content provider "${spec.populate}" is not registered.`,
				meta: { provider: spec.populate, available: registries.contentProviders.ids() },
			});
		}

		const slots = buildSlots(skeleton, assigned.value).filter((slot) => !pinned.has(slot.nodeId));
		const populated = await populate(provider, slots);
		if (!populated.ok) {
			return err({
				code: "populate_failed",
				message: populated.error.message,
				...(populated.error.meta === undefined ? {} : { meta: populated.error.meta }),
			});
		}
		for (const [nodeId, data] of populated.value) content.set(nodeId, data);
	}

	const declared = new Set<NodeTypeId>(map.nodeTypes.map((type) => type.id));
	for (const [type] of candidatePool(spec.types.distribution, [])) declared.add(type);
	for (const type of assigned.value.values()) declared.add(type);

	const next: MapDocument = {
		...map,
		seed: spec.seed,
		nodeTypes: [...declared].sort().map((id) => ({ id })),
		nodes: map.nodes.map((node) => {
			const data = content.get(node.id) ?? node.data;
			return {
				...node,
				type: assigned.value.get(node.id) ?? node.type,
				...(data === undefined ? {} : { data }),
			};
		}),
	};

	const structural = validateMap(next, options.spire);
	const constraintErrors = validateConstraints(next, spec.types.constraints, registries.rules);
	if (!structural.ok) {
		return err({
			code: "invalid_output",
			message: `Regenerated map failed structural validation — this is a bug in @edv4h/spire-gen. ${structural.error.map((e) => e.message).join(" ")}`,
			meta: { seed: spec.seed, errors: structural.error },
		});
	}

	// Constraint violations here are *expected*: a pinned completed node may not
	// satisfy the new spec. That is information for the host, not a failure, so
	// it travels on the document rather than replacing it.
	return ok(
		constraintErrors.length === 0
			? next
			: {
					...next,
					meta: {
						...(next.meta ?? {}),
						regenerateWarnings: constraintErrors.map((e) => ({
							code: e.code,
							message: e.message,
						})),
					},
				},
	);
}
