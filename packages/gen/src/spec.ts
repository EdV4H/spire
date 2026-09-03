import { z } from "zod";

/**
 * The generation specification.
 *
 * A GenSpec is pure JSON — no functions anywhere — because it *is* the
 * serialisable artefact an application stores as a template. Every behavioural
 * choice is a registered id: which skeleton algorithm, which assigner, which
 * rules, which content provider. Swapping behaviour means loading a different
 * plugin, not editing the spec's type.
 */

export const constraintSchema = z.looseObject({
	/** Id of a registered `ConstraintRule`. Every other key is that rule's parameters. */
	rule: z.string().min(1),
});

export const skeletonSpecSchema = z.looseObject({
	/** Id of a registered `SkeletonAlgorithm`. Defaults to the built-in walk. */
	algorithm: z.string().min(1).default("sts-walks"),
	grid: z.looseObject({
		cols: z.int().positive(),
		rows: z.int().positive(),
	}),
	/** Number of walks from top to bottom. More walks means denser branching. */
	walks: z.int().positive().default(4),
	/** Minimum number of distinct entry columns on row 0. */
	minStarts: z.int().positive().default(2),
	/**
	 * Maximum number of distinct entry columns. Omit for no cap; set it equal to
	 * `minStarts` to pin the count, and both to 1 for a single starting node.
	 */
	maxStarts: z.int().positive().optional(),
	/**
	 * Maximum number of distinct nodes on the terminal row. Omit for no cap; set
	 * to 1 to funnel every route into a single finish.
	 *
	 * Enforced by narrowing the columns a walk may occupy as it approaches the
	 * end, so the funnel cannot introduce a crossing.
	 */
	maxEnds: z.int().positive().optional(),
	/** Which columns a walk may step to next. */
	connectivity: z.literal("closest3").default("closest3"),
});

export const typesSpecSchema = z.looseObject({
	/** Id of a registered `TypeAssigner`. */
	assigner: z.string().min(1).default("rejection"),
	/** Relative weights per node type id. Weights need not sum to 1. */
	distribution: z.record(z.string().min(1), z.number().nonnegative()),
	constraints: z.array(constraintSchema).default([]),
});

export const genSpecSchema = z.looseObject({
	seed: z.number(),
	skeleton: skeletonSpecSchema,
	types: typesSpecSchema,
	/**
	 * Id of a registered `ContentProvider`, or null to leave `node.data` empty.
	 * An id rather than a function, so the spec stays storable.
	 */
	populate: z.string().min(1).nullable().default(null),
	/** Passed through to `map.meta`. */
	meta: z.record(z.string(), z.unknown()).optional(),
});

export type Constraint = z.infer<typeof constraintSchema>;
export type SkeletonSpec = z.infer<typeof skeletonSpecSchema>;
export type TypesSpec = z.infer<typeof typesSpecSchema>;
export type GenSpec = z.infer<typeof genSpecSchema>;
export type GenSpecInput = z.input<typeof genSpecSchema>;
