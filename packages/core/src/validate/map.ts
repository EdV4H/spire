import type { Spire } from "../plugin/create-spire.js";
import type { MapValidator, ValidateContext } from "../plugin/plugin.js";
import { err, ok, type Result } from "../result.js";
import { mapDocumentSchema } from "../schema.js";
import type { MapDocument } from "../types.js";
import { type ValidationError, validationError } from "./errors.js";
import { checkInvariants } from "./invariants.js";
import { zodIssuesToErrors } from "./zod-issues.js";

/**
 * Validate a map document.
 *
 * Passing a `Spire` additionally runs every plugin-registered validator and
 * checks `node.data` against the schema its node type declared. Without one,
 * only the built-in invariants run — which is the right default, because a map
 * is well-formed independently of which plugins a particular host loaded.
 */
export function validateMap(doc: unknown, spire?: Spire): Result<MapDocument, ValidationError[]> {
	const parsed = mapDocumentSchema.safeParse(doc);
	if (!parsed.success) return err(zodIssuesToErrors(parsed.error.issues));

	const map = parsed.data as MapDocument;
	const errors = checkInvariants(map);

	if (spire !== undefined) {
		errors.push(...checkNodeData(map, spire));
		errors.push(...runPluginValidators(map, spire));
	}

	return errors.length > 0 ? err(errors) : ok(map);
}

function checkNodeData(map: MapDocument, spire: Spire): ValidationError[] {
	const errors: ValidationError[] = [];

	map.nodes.forEach((node, i) => {
		const schema = spire.nodeTypes.get(node.type)?.dataSchema;
		if (schema === undefined) return;
		const parsed = schema.safeParse(node.data ?? {});
		if (parsed.success) return;
		for (const issue of parsed.error.issues) {
			errors.push(
				validationError(
					"node_data",
					["nodes", i, "data", ...issue.path.map((p) => (typeof p === "symbol" ? String(p) : p))],
					`Node "${node.id}" (type "${node.type}"): ${issue.message}`,
					{ nodeId: node.id, type: node.type },
				),
			);
		}
	});

	return errors;
}

function runPluginValidators(map: MapDocument, spire: Spire): ValidationError[] {
	const ctx: ValidateContext = { map, nodeTypes: spire.nodeTypes };
	const validators = [...spire.validators.getAll().values()].sort(byOrder);

	const errors: ValidationError[] = [];
	for (const validator of validators) errors.push(...validator.validate(ctx));
	return errors;
}

function byOrder(a: MapValidator, b: MapValidator): number {
	return (a.order ?? 0) - (b.order ?? 0);
}
