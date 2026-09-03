import { err, type NodeId, type NodeTypeId, ok, type Registry } from "@edv4h/spire-core";
import type {
	AssignFailure,
	AssignInput,
	ConstraintRule,
	RuleContext,
	Skeleton,
	TypeAssigner,
} from "../registries.js";
import type { Constraint } from "../spec.js";

/**
 * Constraint satisfaction by rejection sampling.
 *
 * Nodes are visited row by row so that a rule looking "backwards" (a
 * predecessor's type, a sibling already decided) always has something to look
 * at. For each node the weighted distribution is sampled, candidates that any
 * rule rejects are dropped, and if nothing survives the whole attempt restarts
 * with a fresh stream.
 *
 * **Termination is the contract here.** A spec whose rules contradict each
 * other has no solution, and a sampler with no attempt cap would hang a host
 * forever. The cap turns that into an `unsatisfiable` error that names the
 * node, the row, and the rules that rejected every candidate — which is the
 * information you need to fix the spec.
 */

export const REJECTION_ASSIGNER_ID = "rejection";

export interface RejectionOptions {
	/** Whole-map attempts before giving up. */
	maxAttempts?: number;
	/**
	 * Give up early after this many attempts that fail at the same node for the
	 * same reasons.
	 *
	 * The skeleton does not change between attempts — only the type draws do —
	 * so an identical block repeating is strong evidence that the constraints,
	 * not the luck of the draw, are what is wrong. Without this a contradictory
	 * spec burns the full attempt budget before saying anything.
	 */
	stopAfterIdenticalBlocks?: number;
}

interface PreparedRule {
	rule: ConstraintRule;
	params: Record<string, unknown>;
}

export function createRejectionAssigner(options: RejectionOptions = {}): TypeAssigner {
	const maxAttempts = options.maxAttempts ?? 1000;
	const stopAfterIdenticalBlocks = options.stopAfterIdenticalBlocks ?? 25;

	return {
		id: REJECTION_ASSIGNER_ID,
		assign(input) {
			const prepared = prepareRules(input.spec.types.constraints, input.rules);
			if (!prepared.ok) return prepared;

			const weights = candidatePool(input.spec.types.distribution, prepared.value);
			if (weights.length === 0) {
				return err({
					code: "invalid_params" as const,
					message: "types.distribution has no entry with a positive weight.",
				});
			}

			const index = buildSkeletonIndex(input.skeleton);
			let lastBlock: BlockedNode | undefined;
			let lastSignature = "";
			let repeats = 0;
			let attempts = 0;

			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				attempts = attempt + 1;
				const rng = input.rng.fork();
				const result = attemptAssignment(index, prepared.value, weights, rng);
				if (result.ok) return ok(result.value);

				lastBlock = result.error;
				const signature = `${result.error.nodeId}|${result.error.reasons.join("|")}`;
				repeats = signature === lastSignature ? repeats + 1 : 0;
				lastSignature = signature;
				if (repeats >= stopAfterIdenticalBlocks) break;
			}

			const repeated = repeats >= stopAfterIdenticalBlocks;
			return err({
				code: "unsatisfiable" as const,
				message: lastBlock
					? `No type satisfied every constraint for node "${lastBlock.nodeId}" (row ${lastBlock.row}) after ${attempts} attempts${
							repeated ? ", all blocked identically — the constraints contradict each other" : ""
						}. Rejections: ${lastBlock.reasons.join("; ")}.`
					: `No assignment satisfied the constraints in ${attempts} attempts.`,
				meta: {
					attempts,
					maxAttempts,
					stoppedEarly: repeated,
					...(lastBlock === undefined
						? {}
						: { nodeId: lastBlock.nodeId, row: lastBlock.row, reasons: lastBlock.reasons }),
				},
			});
		},
	};
}

interface BlockedNode {
	nodeId: NodeId;
	row: number;
	reasons: string[];
}

interface SkeletonIndex {
	positions: Map<NodeId, { col: number; row: number }>;
	predecessors: Map<NodeId, NodeId[]>;
	successors: Map<NodeId, NodeId[]>;
	siblings: Map<NodeId, NodeId[]>;
	ordered: NodeId[];
	terminalRow: number;
}

function buildSkeletonIndex(skeleton: Skeleton): SkeletonIndex {
	const positions = new Map<NodeId, { col: number; row: number }>();
	const predecessors = new Map<NodeId, NodeId[]>();
	const successors = new Map<NodeId, NodeId[]>();

	for (const node of skeleton.nodes) {
		positions.set(node.id, node.position);
		predecessors.set(node.id, []);
		successors.set(node.id, []);
	}
	for (const edge of skeleton.edges) {
		predecessors.get(edge.to)?.push(edge.from);
		successors.get(edge.from)?.push(edge.to);
	}

	// Siblings: nodes reachable from a shared parent. This is what
	// `branchDistinct` reasons about.
	const siblings = new Map<NodeId, NodeId[]>();
	for (const node of skeleton.nodes) {
		const group = new Set<NodeId>();
		for (const parent of predecessors.get(node.id) ?? []) {
			for (const child of successors.get(parent) ?? []) {
				if (child !== node.id) group.add(child);
			}
		}
		siblings.set(node.id, [...group]);
	}

	const ordered = [...skeleton.nodes]
		.sort((a, b) => a.position.row - b.position.row || a.position.col - b.position.col)
		.map((node) => node.id);

	return {
		positions,
		predecessors,
		successors,
		siblings,
		ordered,
		terminalRow: skeleton.grid.rows - 1,
	};
}

function prepareRules(
	constraints: readonly Constraint[],
	rules: Registry<ConstraintRule>,
): { ok: true; value: PreparedRule[] } | { ok: false; error: AssignFailure } {
	const prepared: PreparedRule[] = [];

	for (const constraint of constraints) {
		const rule = rules.get(constraint.rule);
		if (rule === undefined) {
			return {
				ok: false,
				error: {
					code: "unknown_rule",
					message: `Constraint rule "${constraint.rule}" is not registered. Add the plugin that provides it to createSpire({ plugins }).`,
					meta: { rule: constraint.rule, available: rules.ids() },
				},
			};
		}

		const { rule: _id, ...params } = constraint as Record<string, unknown> & { rule: string };
		if (rule.paramsSchema !== undefined) {
			const parsed = rule.paramsSchema.safeParse(params);
			if (!parsed.success) {
				return {
					ok: false,
					error: {
						code: "invalid_params",
						message: `Constraint "${constraint.rule}": ${parsed.error.issues.map((i) => i.message).join("; ")}`,
						meta: { rule: constraint.rule },
					},
				};
			}
			prepared.push({ rule, params: parsed.data as Record<string, unknown> });
		} else {
			prepared.push({ rule, params });
		}
	}

	return { ok: true, value: prepared };
}

function attemptAssignment(
	index: SkeletonIndex,
	rules: readonly PreparedRule[],
	weights: readonly (readonly [string, number])[],
	rng: ReturnType<AssignInput["rng"]["fork"]>,
): { ok: true; value: Map<NodeId, NodeTypeId> } | { ok: false; error: BlockedNode } {
	const assigned = new Map<NodeId, NodeTypeId>();

	for (const nodeId of index.ordered) {
		const position = index.positions.get(nodeId) ?? { col: 0, row: 0 };
		const reasons: string[] = [];
		const candidates = weights.filter(([type]) => {
			const verdict = evaluateAll(rules, {
				nodeId,
				candidateType: type,
				position,
				terminalRow: index.terminalRow,
				assigned,
				predecessors: index.predecessors.get(nodeId) ?? [],
				successors: index.successors.get(nodeId) ?? [],
				siblings: index.siblings.get(nodeId) ?? [],
				positionOf: (id) => index.positions.get(id),
				params: {},
			});
			if (!verdict.allowed && verdict.reason !== undefined) {
				reasons.push(`${type}: ${verdict.reason}`);
			}
			return verdict.allowed;
		});

		const chosen = rng.weighted(candidates);
		if (chosen === undefined) {
			return { ok: false, error: { nodeId, row: position.row, reasons } };
		}
		assigned.set(nodeId, chosen);
	}

	return { ok: true, value: assigned };
}

function evaluateAll(
	rules: readonly PreparedRule[],
	base: Omit<RuleContext, "params"> & { params: Record<string, unknown> },
): { allowed: boolean; reason?: string } {
	for (const { rule, params } of rules) {
		const verdict = rule.evaluate({ ...base, params });
		if (!verdict.allowed) {
			return verdict.reason === undefined
				? { allowed: false }
				: { allowed: false, reason: `${rule.id} — ${verdict.reason}` };
		}
	}
	return { allowed: true };
}

/**
 * The types the sampler may draw from: the weighted distribution, plus any type
 * a rule places itself (`contributesTypes`). A contributed type gets a nominal
 * weight, because the rule that introduced it is what decides where it may go —
 * the weight only breaks ties among whatever survives on that node.
 */
export function candidatePool(
	distribution: Record<string, number>,
	rules: readonly PreparedRule[],
): [string, number][] {
	const pool = new Map<string, number>();
	for (const [type, weight] of Object.entries(distribution)) {
		if (weight > 0) pool.set(type, weight);
	}
	for (const { rule, params } of rules) {
		for (const type of rule.contributesTypes?.(params) ?? []) {
			if (!pool.has(type)) pool.set(type, 1);
		}
	}
	return [...pool];
}

/** Every type id a skeleton was assigned, for building `map.nodeTypes`. */
export function usedTypes(assigned: ReadonlyMap<NodeId, NodeTypeId>): NodeTypeId[] {
	return [...new Set(assigned.values())].sort();
}
