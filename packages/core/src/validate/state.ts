import { err, ok, type Result } from "../result.js";
import { stateDocumentSchema } from "../schema.js";
import type { MapDocument, StateDocument } from "../types.js";
import { type ValidationError, validationError } from "./errors.js";
import { zodIssuesToErrors } from "./zod-issues.js";

/**
 * Validate a state document against the map it claims to belong to.
 *
 * A state referencing an unknown node is an error rather than something to
 * quietly drop: it usually means the map was regenerated underneath a stored
 * state, and the host needs to know before it shows a wrong progress number.
 */
export function validateState(
	doc: unknown,
	map: MapDocument,
): Result<StateDocument, ValidationError[]> {
	const parsed = stateDocumentSchema.safeParse(doc);
	if (!parsed.success) return err(zodIssuesToErrors(parsed.error.issues));

	const state = parsed.data as StateDocument;
	const errors: ValidationError[] = [];

	if (state.mapId !== map.id) {
		errors.push(
			validationError(
				"state_mismatch",
				["mapId"],
				`State belongs to map "${state.mapId}" but was validated against "${map.id}".`,
				{ stateMapId: state.mapId, mapId: map.id },
			),
		);
	}

	const nodeIds = new Set(map.nodes.map((node) => node.id));
	for (const nodeId of Object.keys(state.completed)) {
		if (!nodeIds.has(nodeId)) {
			errors.push(
				validationError(
					"state_mismatch",
					["completed", nodeId],
					`State marks "${nodeId}" completed, but the map has no such node.`,
					{ nodeId },
				),
			);
		}
	}

	return errors.length > 0 ? err(errors) : ok(state);
}

/** An empty state document for a map. */
export function emptyState(map: MapDocument): StateDocument {
	return {
		smfVersion: map.smfVersion,
		mapId: map.id,
		completed: {},
	};
}
