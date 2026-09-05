import { z } from "zod";

/**
 * Spire Map Format (SMF) schemas.
 *
 * Two rules govern every definition here:
 *
 * 1. **Forward-compatible.** Objects are `looseObject`, never `object` or
 *    `strictObject`, so a document written by a newer minor version keeps its
 *    unknown fields when it round-trips through an older reader (design doc
 *    §2.3). Stripping unknown keys would silently destroy a host's data.
 * 2. **Opaque payloads.** `data` and `meta` are `Record<string, unknown>`. The
 *    SDK never interprets them; node types are host-defined identifiers.
 */

export const SMF_VERSION = "0.1";

const freeform = z.record(z.string(), z.unknown());

export const nodeIdSchema = z.string().min(1);
export const edgeIdSchema = z.string().min(1);
export const nodeTypeIdSchema = z.string().min(1);

export const gridSchema = z.looseObject({
	cols: z.int().positive(),
	rows: z.int().positive(),
});

export const positionSchema = z.looseObject({
	col: z.int().nonnegative(),
	row: z.int().nonnegative(),
});

export const nodeTypeSchema = z.looseObject({
	id: nodeTypeIdSchema,
	meta: freeform.optional(),
});

export const nodeSchema = z.looseObject({
	id: nodeIdSchema,
	type: nodeTypeIdSchema,
	position: positionSchema,
	data: freeform.optional(),
});

export const edgeSchema = z.looseObject({
	id: edgeIdSchema,
	from: nodeIdSchema,
	to: nodeIdSchema,
});

export const mapDocumentSchema = z.looseObject({
	smfVersion: z.string().min(1),
	id: z.string().min(1),
	/** Generation seed, or `null` for a hand-authored map. */
	seed: z.number().nullable(),
	grid: gridSchema,
	nodeTypes: z.array(nodeTypeSchema),
	nodes: z.array(nodeSchema),
	edges: z.array(edgeSchema),
	meta: freeform.optional(),
});

export const completionRecordSchema = z.looseObject({
	/** ISO 8601 timestamp. Used as the CRDT merge ordering key. */
	at: z.string().min(1),
	by: z.string().optional(),
	data: freeform.optional(),
});

export const stateDocumentSchema = z.looseObject({
	smfVersion: z.string().min(1),
	mapId: z.string().min(1),
	completed: z.record(nodeIdSchema, completionRecordSchema),
	meta: freeform.optional(),
});
