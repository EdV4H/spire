import type { $ZodIssue } from "zod/v4/core";
import { type ValidationError, validationError } from "./errors.js";

/**
 * Zod issues become plain `ValidationError`s so a host handles one error shape
 * whether the document failed the schema or a topological invariant, and so the
 * error type stays free of zod in the public surface.
 */
export function zodIssuesToErrors(issues: readonly $ZodIssue[]): ValidationError[] {
	return issues.map((issue) =>
		validationError(
			"schema",
			issue.path.map((segment) => (typeof segment === "symbol" ? String(segment) : segment)),
			issue.message,
			{ zodCode: issue.code },
		),
	);
}
