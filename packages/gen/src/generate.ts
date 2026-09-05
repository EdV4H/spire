import {
	createRng,
	err,
	type MapDocument,
	mapIdFromSeed,
	type NodeId,
	type NodeTypeId,
	ok,
	type Result,
	SMF_VERSION,
	type Spire,
	type ValidationError,
	validateMap,
} from "@edv4h/spire-core";
import { candidatePool } from "./assign/rejection.js";
import { buildSlots, populate } from "./populate.js";
import type { GenRegistries, Skeleton } from "./registries.js";
import { resolveRegistries } from "./resolve-registries.js";
import { type GenSpec, type GenSpecInput, genSpecSchema } from "./spec.js";
import { validateConstraints } from "./validate.js";

/**
 * The generation pipeline: skeleton → type assignment → content → validation.
 *
 * Each stage is also exported on its own, because the useful failure modes are
 * per-stage: you want the skeleton without types while tuning walk density, or
 * a fresh assignment over a skeleton you already like.
 */

export interface GenError {
	code:
		| "invalid_spec"
		| "registry_conflict"
		| "unknown_skeleton"
		| "unknown_assigner"
		| "unknown_provider"
		| "skeleton_failed"
		| "assign_failed"
		| "populate_failed"
		| "invalid_output";
	message: string;
	meta?: Record<string, unknown>;
}

export interface GenerateOptions {
	/**
	 * The Spire whose plugins provide the rules, algorithms and content
	 * providers this spec names. Omit it to run with only the built-ins, which
	 * is the right default for a spec that uses none.
	 */
	spire?: Spire;
}

export async function generate(
	specInput: GenSpecInput,
	options: GenerateOptions = {},
): Promise<Result<MapDocument, GenError>> {
	const parsed = genSpecSchema.safeParse(specInput);
	if (!parsed.success) {
		return err({
			code: "invalid_spec",
			message: `Invalid GenSpec: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
		});
	}
	const spec = parsed.data as GenSpec;

	const registries = resolveRegistries(options.spire);
	const conflicts = registries.conflicts();
	if (conflicts.length > 0) {
		return err({
			code: "registry_conflict",
			message: `Generation registries have conflicting registrations: ${conflicts.map((c) => c.message).join(" ")}`,
			meta: { conflicts },
		});
	}

	const rng = createRng(spec.seed);

	const skeletonResult = buildSkeleton(spec, registries, rng);
	if (!skeletonResult.ok) return skeletonResult;
	const skeleton = skeletonResult.value;

	const assignResult = assignTypes(spec, skeleton, registries, rng);
	if (!assignResult.ok) return assignResult;
	const assigned = assignResult.value;

	let content = new Map<NodeId, Record<string, unknown>>();
	if (spec.populate !== null) {
		const provider = registries.contentProviders.get(spec.populate);
		if (provider === undefined) {
			return err({
				code: "unknown_provider",
				message: `Content provider "${spec.populate}" is not registered. Pass it to createGenPlugin({ contentProviders }).`,
				meta: { provider: spec.populate, available: registries.contentProviders.ids() },
			});
		}

		const populated = await populate(provider, buildSlots(skeleton, assigned));
		if (!populated.ok) {
			return err({
				code: "populate_failed",
				message: populated.error.message,
				...(populated.error.meta === undefined ? {} : { meta: populated.error.meta }),
			});
		}
		content = populated.value;
	}

	const map = assemble(spec, skeleton, assigned, content, registries);

	// The generator is not allowed to emit a document it would itself reject.
	// If this fires it is a bug in Spire, not in the caller's spec, so the error
	// carries the seed and spec needed to reproduce it.
	const structural = validateMap(map, options.spire);
	const constraintErrors = validateConstraints(map, spec.types.constraints, registries.rules);
	if (!structural.ok || constraintErrors.length > 0) {
		const errors: ValidationError[] = [
			...(structural.ok ? [] : structural.error),
			...constraintErrors,
		];
		return err({
			code: "invalid_output",
			message: `Generated map failed validation — this is a bug in @edv4h/spire-gen. Seed ${spec.seed}. ${errors.map((e) => e.message).join(" ")}`,
			meta: { seed: spec.seed, spec, errors },
		});
	}

	return ok(map);
}

/** Stage 1 on its own: the graph shape, with no types decided. */
export function buildSkeleton(
	spec: GenSpec,
	registries: GenRegistries,
	rng = createRng(spec.seed),
): Result<Skeleton, GenError> {
	const algorithm = registries.skeletons.get(spec.skeleton.algorithm);
	if (algorithm === undefined) {
		return err({
			code: "unknown_skeleton",
			message: `Skeleton algorithm "${spec.skeleton.algorithm}" is not registered.`,
			meta: { algorithm: spec.skeleton.algorithm, available: registries.skeletons.ids() },
		});
	}

	const result = algorithm.generate(spec.skeleton as Record<string, unknown>, rng);
	if (!result.ok) {
		return err({
			code: "skeleton_failed",
			message: result.error.message,
			...(result.error.meta === undefined ? {} : { meta: result.error.meta }),
		});
	}
	return ok(result.value);
}

/** Stage 2 on its own: types over an existing skeleton. */
export function assignTypes(
	spec: GenSpec,
	skeleton: Skeleton,
	registries: GenRegistries,
	rng = createRng(spec.seed),
): Result<Map<NodeId, NodeTypeId>, GenError> {
	const assigner = registries.assigners.get(spec.types.assigner);
	if (assigner === undefined) {
		return err({
			code: "unknown_assigner",
			message: `Type assigner "${spec.types.assigner}" is not registered.`,
			meta: { assigner: spec.types.assigner, available: registries.assigners.ids() },
		});
	}

	const result = assigner.assign({ skeleton, spec, rules: registries.rules, rng });
	if (!result.ok) {
		return err({
			code: "assign_failed",
			message: result.error.message,
			...(result.error.meta === undefined ? {} : { meta: result.error.meta }),
		});
	}
	return ok(result.value);
}

function assemble(
	spec: GenSpec,
	skeleton: Skeleton,
	assigned: ReadonlyMap<NodeId, NodeTypeId>,
	content: ReadonlyMap<NodeId, Record<string, unknown>>,
	registries: GenRegistries,
): MapDocument {
	const declared = new Set<NodeTypeId>();
	for (const [type] of candidatePool(spec.types.distribution, preparedFor(spec, registries))) {
		declared.add(type);
	}
	for (const type of assigned.values()) declared.add(type);

	return {
		smfVersion: SMF_VERSION,
		id: mapIdFromSeed(spec.seed),
		seed: spec.seed,
		grid: skeleton.grid,
		nodeTypes: [...declared].sort().map((id) => ({ id })),
		nodes: skeleton.nodes.map((node) => {
			const data = content.get(node.id);
			return {
				id: node.id,
				type: assigned.get(node.id) ?? "",
				position: node.position,
				...(data === undefined ? {} : { data }),
			};
		}),
		edges: skeleton.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
		...(spec.meta === undefined ? {} : { meta: spec.meta }),
	};
}

/**
 * The rule/params pairs a spec resolves to, used only to work out which types a
 * rule contributes. Unresolvable constraints are skipped here; `assignTypes`
 * has already reported them.
 */
function preparedFor(spec: GenSpec, registries: GenRegistries) {
	return spec.types.constraints.flatMap((constraint) => {
		const rule = registries.rules.get(constraint.rule);
		if (rule === undefined) return [];
		const { rule: _id, ...params } = constraint as Record<string, unknown> & { rule: string };
		const parsed = rule.paramsSchema?.safeParse(params);
		if (parsed !== undefined && !parsed.success) return [];
		return [{ rule, params: (parsed?.data as Record<string, unknown>) ?? params }];
	});
}
