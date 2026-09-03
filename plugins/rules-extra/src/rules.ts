import type { ConstraintRule } from "@edv4h/spire-gen";
import { z } from "zod";

/**
 * Constraint rules that are useful often enough to publish, but not often
 * enough to live in the SDK's own vocabulary.
 *
 * The split matters: `@edv4h/spire-gen` ships the five rules a map needs to be
 * structurally sensible, and everything past that arrives as a package a host
 * chooses. A rule here has exactly the same standing as one written inside an
 * application — same interface, same registry, same validation path.
 */

const maxTotalParams = z.looseObject({
	type: z.string().min(1),
	max: z.int().nonnegative(),
});

/**
 * At most `max` nodes of a type across the whole map.
 *
 * Useful for a type that is meant to be an event rather than a texture: three
 * checkpoints on a twelve-row map read as milestones, twelve read as noise.
 */
export function maxTotalRule(): ConstraintRule {
	return {
		id: "maxTotal",
		paramsSchema: maxTotalParams,
		evaluate(ctx) {
			const { type, max } = ctx.params as { type: string; max: number };
			if (ctx.candidateType !== type) return { allowed: true };

			let count = 0;
			for (const [nodeId, assigned] of ctx.assigned) {
				if (nodeId !== ctx.nodeId && assigned === type) count += 1;
			}

			return count < max
				? { allowed: true }
				: { allowed: false, reason: `the map already has ${count} node(s) of type "${type}"` };
		},
	};
}

const rowRangeParams = z
	.looseObject({
		type: z.string().min(1),
		minRow: z.int().optional(),
		maxRow: z.int().optional(),
	})
	.refine((params) => params.minRow !== undefined || params.maxRow !== undefined, {
		message: "rowRange needs at least one of minRow or maxRow",
	});

/**
 * A type may only appear inside a row window. Negative rows count from the
 * terminal row, so `{ maxRow: -2 }` means "not on the last two rows".
 */
export function rowRangeRule(): ConstraintRule {
	return {
		id: "rowRange",
		paramsSchema: rowRangeParams,
		evaluate(ctx) {
			const { type, minRow, maxRow } = ctx.params as {
				type: string;
				minRow?: number;
				maxRow?: number;
			};
			if (ctx.candidateType !== type) return { allowed: true };

			const resolve = (row: number) => (row < 0 ? ctx.terminalRow + 1 + row : row);
			const row = ctx.position.row;

			if (minRow !== undefined && row < resolve(minRow)) {
				return { allowed: false, reason: `type "${type}" starts at row ${resolve(minRow)}` };
			}
			if (maxRow !== undefined && row > resolve(maxRow)) {
				return { allowed: false, reason: `type "${type}" ends at row ${resolve(maxRow)}` };
			}
			return { allowed: true };
		},
	};
}

const afterTypesParams = z.looseObject({
	type: z.string().min(1),
	after: z.array(z.string().min(1)).min(1),
});

/**
 * A type may only follow nodes of the listed types.
 *
 * This is how a spec expresses a prerequisite in structural terms — "a boss
 * only after an elite" — without the SDK learning what a boss or an elite is.
 *
 * Nodes on row 0 have no predecessor, so the type is refused there: a
 * prerequisite that nothing can satisfy is a contradiction, and saying so at
 * assignment time beats emitting a map that quietly breaks the intent.
 */
export function afterTypesRule(): ConstraintRule {
	return {
		id: "afterTypes",
		paramsSchema: afterTypesParams,
		evaluate(ctx) {
			const { type, after } = ctx.params as { type: string; after: string[] };
			if (ctx.candidateType !== type) return { allowed: true };
			if (ctx.predecessors.length === 0) {
				return {
					allowed: false,
					reason: `type "${type}" needs a predecessor and this is a start node`,
				};
			}

			for (const predecessor of ctx.predecessors) {
				const assigned = ctx.assigned.get(predecessor);
				// An undecided predecessor is not yet a violation: assignment runs
				// row by row, so this only happens for an edge that skips a row,
				// and the validator will catch a real breach on the finished map.
				if (assigned === undefined || after.includes(assigned)) return { allowed: true };
			}

			return {
				allowed: false,
				reason: `type "${type}" must follow one of: ${after.join(", ")}`,
			};
		},
	};
}

export function extraRules(): ConstraintRule[] {
	return [maxTotalRule(), rowRangeRule(), afterTypesRule()];
}
