/**
 * Validation errors are data, not exceptions: `validateMap` returns every
 * problem it found so a host can show all of them at once.
 */

export type ValidationErrorCode =
	/** The document did not match the SMF schema. */
	| "schema"
	/** The edge graph contains a cycle. */
	| "dag_cycle"
	/** An edge does not run strictly downward (`row(from) < row(to)`). */
	| "edge_direction"
	/** Two edges cross when drawn on the grid. */
	| "edge_crossing"
	/** An edge's line passes through a third node's cell. */
	| "edge_through_node"
	/** A non-start-row node has in-degree 0. */
	| "degree_in"
	/** A non-terminal-row node has out-degree 0. */
	| "degree_out"
	/** A node sits outside the declared grid. */
	| "position_range"
	/** Two nodes occupy the same grid cell. */
	| "position_collision"
	/** An edge endpoint or node type does not exist. */
	| "ref_integrity"
	/** Two nodes, edges or node types share an id. */
	| "duplicate_id"
	/** `node.data` failed the schema declared by its node type. */
	| "node_data"
	/** The state document disagrees with the map it belongs to. */
	| "state_mismatch"
	// Plugin-supplied validators use their own codes.
	| (string & Record<never, never>);

export interface ValidationError {
	code: ValidationErrorCode;
	/** JSON path into the document, e.g. `["nodes", 3, "position"]`. */
	path: readonly (string | number)[];
	message: string;
	/** Structured detail — ids involved, expected values, the validator's own id. */
	meta?: Record<string, unknown>;
}

export function validationError(
	code: ValidationErrorCode,
	path: readonly (string | number)[],
	message: string,
	meta?: Record<string, unknown>,
): ValidationError {
	return meta === undefined ? { code, path, message } : { code, path, message, meta };
}
