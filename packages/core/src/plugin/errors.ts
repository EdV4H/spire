/**
 * Errors raised by the plugin kernel. Like validation errors these are values:
 * `createSpire` returns them rather than throwing, so a host can report exactly
 * which plugin failed and why.
 */

export type PluginErrorCode =
	/** The plugin was built against a different plugin API major version. */
	| "api_version_mismatch"
	/** Two plugins in the same list declare the same id. */
	| "duplicate_plugin_id"
	/** A declared dependency is not present in the plugin list. */
	| "missing_dependency"
	/** The dependency graph contains a cycle. */
	| "cyclic_dependency"
	/** `setup` threw or rejected. */
	| "setup_failed"
	/** A teardown threw or rejected during rollback or `destroy()`. */
	| "teardown_failed"
	/** Two registrations claimed the same id in the same registry. */
	| "registry_conflict";

export interface PluginError {
	code: PluginErrorCode;
	message: string;
	/** The plugin the error is attributed to, when one can be identified. */
	pluginId?: string;
	meta?: Record<string, unknown>;
	/** The thrown value, for `setup_failed` / `teardown_failed`. */
	cause?: unknown;
}

export function pluginError(
	code: PluginErrorCode,
	message: string,
	extra: Omit<PluginError, "code" | "message"> = {},
): PluginError {
	return { code, message, ...extra };
}
