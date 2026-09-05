import type { Spire } from "./plugin/create-spire.js";
import { err, ok, type Result } from "./result.js";
import { SMF_VERSION } from "./schema.js";

/**
 * Version migration.
 *
 * SMF follows semver: within a major version new fields may appear and readers
 * keep what they do not understand, so a minor-version bump needs no migration.
 * A breaking change ships a `Migration` that upgrades one version to the next;
 * `migrate` chains them.
 *
 * v0.1 defines no migrations — this is the mechanism, not a backlog of them.
 */

export interface MigrationError {
	code: "no_path" | "not_a_document" | "loop";
	message: string;
	from?: string;
	to: string;
}

export function documentVersion(doc: unknown): string | undefined {
	if (typeof doc !== "object" || doc === null) return undefined;
	const version = (doc as { smfVersion?: unknown }).smfVersion;
	return typeof version === "string" ? version : undefined;
}

/**
 * Upgrade a document to `target` (the SDK's current version by default) by
 * chaining registered migrations. A document already at the target is returned
 * unchanged.
 */
export function migrate(
	doc: unknown,
	spire?: Spire,
	target: string = SMF_VERSION,
): Result<unknown, MigrationError> {
	const from = documentVersion(doc);
	if (from === undefined) {
		return err({
			code: "not_a_document",
			message: "Value has no smfVersion field, so its format is unknown.",
			to: target,
		});
	}
	if (from === target) return ok(doc);

	const migrations = spire === undefined ? [] : [...spire.migrations.getAll().values()];

	let current = doc;
	let version = from;
	const seen = new Set<string>([version]);

	while (version !== target) {
		const step = migrations.find((m) => m.from === version);
		if (step === undefined) {
			return err({
				code: "no_path",
				message: `No migration registered from SMF ${version} to ${target}.`,
				from: version,
				to: target,
			});
		}

		current = step.migrate(current);
		version = step.to;

		if (seen.has(version)) {
			return err({
				code: "loop",
				message: `Migrations loop back to SMF ${version}.`,
				from,
				to: target,
			});
		}
		seen.add(version);
	}

	return ok(current);
}
