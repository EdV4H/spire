import type { Spire } from "../plugin/create-spire.js";
import { BUILTIN_POLICIES } from "../plugin/create-spire.js";
import type { PolicyContext, ProgressionPolicyDefinition } from "../plugin/plugin.js";
import { err, ok, type Result } from "../result.js";
import type { CompletionRecord, MapDocument, NodeId, StateDocument } from "../types.js";
import { getNodeStatus } from "./status.js";

/**
 * State transitions. Both are pure: they return a new `StateDocument` and never
 * mutate the one passed in, so a host can keep the previous value for undo or
 * for an optimistic-update rollback without copying defensively.
 */

export interface RuleViolation {
	code: "not_allowed" | "unknown_node" | "unknown_policy";
	message: string;
	nodeId: NodeId;
	meta?: Record<string, unknown>;
}

export interface CompleteOptions {
	/**
	 * Policy id, a policy definition, or a bare predicate. Defaults to
	 * `"strict"`: only a reachable node may be completed.
	 *
	 * A string is resolved against `spire.policies`, which is what lets a host's
	 * configuration name a policy without shipping code for it.
	 */
	policy?: string | ProgressionPolicyDefinition | ((ctx: PolicyContext) => boolean);
	spire?: Spire;
	/** Timestamp for the completion record. Defaults to now. */
	at?: string;
	by?: string;
	data?: Record<string, unknown>;
}

export function complete(
	map: MapDocument,
	state: StateDocument,
	nodeId: NodeId,
	options: CompleteOptions = {},
): Result<StateDocument, RuleViolation> {
	if (!map.nodes.some((node) => node.id === nodeId)) {
		return err({
			code: "unknown_node",
			message: `Map "${map.id}" has no node "${nodeId}".`,
			nodeId,
		});
	}

	const resolved = resolvePolicy(options);
	if (resolved === undefined) {
		return err({
			code: "unknown_policy",
			message: `Progression policy "${String(options.policy)}" is not registered. Pass a Spire whose plugins provide it.`,
			nodeId,
			meta: { policy: options.policy },
		});
	}

	const status = getNodeStatus(map, state, nodeId);
	const ctx: PolicyContext = { map, state, nodeId, status };

	if (!resolved.canComplete(ctx)) {
		return err({
			code: "not_allowed",
			message: `Policy "${resolved.id}" rejects completing "${nodeId}" while it is ${status}.`,
			nodeId,
			meta: { policy: resolved.id, status },
		});
	}

	const record: CompletionRecord = {
		at: options.at ?? new Date().toISOString(),
		...(options.by === undefined ? {} : { by: options.by }),
		...(options.data === undefined ? {} : { data: options.data }),
	};

	return ok({
		...state,
		completed: { ...state.completed, [nodeId]: record },
	});
}

export function uncomplete(state: StateDocument, nodeId: NodeId): StateDocument {
	if (state.completed[nodeId] === undefined) return state;
	const { [nodeId]: _removed, ...rest } = state.completed;
	return { ...state, completed: rest };
}

function resolvePolicy(options: CompleteOptions): ProgressionPolicyDefinition | undefined {
	const policy = options.policy ?? "strict";

	if (typeof policy === "function") {
		return { id: "custom", canComplete: policy };
	}
	if (typeof policy === "object") {
		return policy;
	}
	if (options.spire !== undefined) {
		return options.spire.policies.get(policy);
	}
	return BUILTIN_POLICIES.find((builtin) => builtin.id === policy);
}
