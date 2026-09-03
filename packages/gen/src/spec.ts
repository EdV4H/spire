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
