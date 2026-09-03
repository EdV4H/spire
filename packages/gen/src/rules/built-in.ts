import { z } from "zod";
import type { ConstraintRule, RuleContext } from "../registries.js";

/**
 * The constraint vocabulary shipped with the SDK.
 *
 * Each rule answers one question — "may this node be this type?" — and answers
 * it the same way for a generator filling a blank map and for a validator
 * re-checking one a human edited. Rules are intentionally small: anything
 * domain-specific ("a gate must follow two steps in this curriculum") belongs
 * in a plugin, not here.
 *
 * `ctx.params` is validated against the rule's own `paramsSchema` once, by the
 * caller, before any evaluation — so `evaluate` reads it directly instead of
 * re-parsing on every candidate. That matters: a rule is evaluated once per
 * node per candidate type per attempt.
 */

/** `row: -1` means the terminal row, mirroring negative array indices. */
function resolveRow(row: number, terminalRow: number): number {
	return row < 0 ? terminalRow + 1 + row : row;
}

const fixedRowParams = z.looseObject({
	row: z.int(),
	type: z.string().min(1),
});

/**
 * A whole row is one type, and that type appears nowhere else. The canonical
 * use is `{ row: -1, type: "final" }`: whatever the walk does, the last row is
 * the destination — and nothing earlier is.
 *
 * The rule is deliberately two-directional. A one-way version ("this row must
 * be `final`") would force every host to also give `final` a weight in
 * `types.distribution`, which would then scatter it across the map. Pinning
 * both ways, together with `contributesTypes`, lets the spec read exactly as
 * the design document writes it.
 */
export function fixedRowRule(): ConstraintRule {
	return {
		id: "fixedRow",
		paramsSchema: fixedRowParams,
		contributesTypes: (params) => [(params as { type: string }).type],
		evaluate(ctx) {
			const { row: rawRow, type } = ctx.params as { row: number; type: string };
			const row = resolveRow(rawRow, ctx.terminalRow);
			const onRow = ctx.position.row === row;
			const isType = ctx.candidateType === type;

			if (onRow && !isType) {
				return { allowed: false, reason: `row ${row} is reserved for type "${type}"` };
			}
			if (!onRow && isType) {
				return { allowed: false, reason: `type "${type}" belongs only on row ${row}` };
			}
			return { allowed: true };
		},
	};
}

const minRowParams = z.looseObject({
	type: z.string().min(1),
	row: z.int(),
});

/** A type may not appear before a given row — a way to pace difficulty. */
export function minRowRule(): ConstraintRule {
	return {
		id: "minRow",
		paramsSchema: minRowParams,
		evaluate(ctx) {
			const { row: rawRow, type } = ctx.params as { row: number; type: string };
			if (ctx.candidateType !== type) return { allowed: true };

			const row = resolveRow(rawRow, ctx.terminalRow);
			return ctx.position.row >= row
				? { allowed: true }
				: { allowed: false, reason: `type "${type}" may not appear before row ${row}` };
		},
	};
}

const noAdjacentSameParams = z.looseObject({
	types: z.array(z.string().min(1)).min(1),
});

/**
 * Listed types may not sit on directly connected nodes. Two checkpoints
 * back-to-back read as one long checkpoint, so this is what keeps a themed type
 * feeling like a punctuation mark.
 */
export function noAdjacentSameRule(): ConstraintRule {
	return {
		id: "noAdjacentSame",
		paramsSchema: noAdjacentSameParams,
		evaluate(ctx) {
			const { types } = ctx.params as { types: string[] };
			if (!types.includes(ctx.candidateType)) return { allowed: true };

			for (const neighbour of [...ctx.predecessors, ...ctx.successors]) {
				if (ctx.assigned.get(neighbour) === ctx.candidateType) {
					return {
						allowed: false,
						reason: `type "${ctx.candidateType}" is already on the adjacent node "${neighbour}"`,
					};
				}
			}
			return { allowed: true };
		},
	};
}

const branchDistinctParams = z.looseObject({
	/**
	 * Types this rule ignores.
	 *
	 * A type pinned by `fixedRow` needs to be here whenever two branches can
	 * merge onto that row: the terminal row is all `final` by construction, so
	 * demanding that siblings there differ is a contradiction — and one that
	 * `fixedRow: -1` plus `branchDistinct`, the most natural pair of constraints
	 * to write, runs into immediately.
	 */
	exempt: z.array(z.string().min(1)).default([]),
});

/**
 * Nodes that branch from the same parent must differ in type — otherwise the
 * choice the branch offers is not a choice.
 */
export function branchDistinctRule(): ConstraintRule {
	return {
		id: "branchDistinct",
		paramsSchema: branchDistinctParams,
		evaluate(ctx) {
			const { exempt } = ctx.params as { exempt: string[] };
			if (exempt.includes(ctx.candidateType)) return { allowed: true };

			for (const sibling of ctx.siblings) {
				if (ctx.assigned.get(sibling) === ctx.candidateType) {
					return {
						allowed: false,
						reason: `sibling "${sibling}" already branches to type "${ctx.candidateType}"`,
					};
				}
			}
			return { allowed: true };
		},
	};
}

const maxPerRowParams = z.looseObject({
	type: z.string().min(1),
	max: z.int().nonnegative(),
});

/** At most `max` nodes of a type on any one row. */
export function maxPerRowRule(): ConstraintRule {
	return {
		id: "maxPerRow",
		paramsSchema: maxPerRowParams,
		evaluate(ctx) {
			const { type, max } = ctx.params as { type: string; max: number };
			if (ctx.candidateType !== type) return { allowed: true };

			const onRow = countOnRow(ctx, type);
			return onRow < max
				? { allowed: true }
				: {
						allowed: false,
						reason: `row ${ctx.position.row} already has ${onRow} node(s) of type "${type}"`,
					};
		},
	};
}

function countOnRow(ctx: RuleContext, type: string): number {
	let count = 0;
	for (const [nodeId, assignedType] of ctx.assigned) {
		if (nodeId === ctx.nodeId || assignedType !== type) continue;
		if (ctx.positionOf(nodeId)?.row === ctx.position.row) count += 1;
	}
	return count;
}

export function builtInRules(): ConstraintRule[] {
	return [
		fixedRowRule(),
		minRowRule(),
		noAdjacentSameRule(),
		branchDistinctRule(),
		maxPerRowRule(),
	];
}
