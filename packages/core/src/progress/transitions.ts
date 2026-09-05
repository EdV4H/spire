import type { Spire } from "../plugin/create-spire.js";
import type { PolicyContext, ProgressionPolicyDefinition } from "../plugin/plugin.js";
import { err, ok, type Result } from "../result.js";
import type { CompletionRecord, MapDocument, NodeId, StateDocument } from "../types.js";
import { BUILTIN_POLICIES, SINGLE_ROUTE } from "./policies.js";
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
	 * `"single-route"`: the completed set must stay one unbroken path, so taking
	 * one arm of a branch costs you the other. Pass `"strict"` to allow every
	 * arm to be walked, or `"free"` to allow anything.
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
			// The status is context, not the reason — `single-route` refuses nodes
			// that are perfectly reachable, and "rejects it while it is reachable"
			// reads as a contradiction rather than as an explanation.
			message: `Policy "${resolved.id}" does not allow completing "${nodeId}" (status: ${status}).`,
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

/** The policy half of `CompleteOptions`, for the questions that record nothing. */
export type PolicyOptions = Pick<CompleteOptions, "policy" | "spire">;

/**
 * Which nodes `complete` would actually accept right now.
 *
 * `getReachableNodes` answers a structural question — who has a completed
 * predecessor — and stays policy-blind on purpose, because that is what the
 * renderer styles. This answers the player's question instead, and the two
 * genuinely differ: under `single-route` the far arm of a branch you already
 * turned away from is still *reachable*, and no longer *completable*.
 *
 * An unregistered policy id yields an empty list rather than an error: nothing
 * is completable under a policy that does not exist.
 */
export function getCompletableNodes(
	map: MapDocument,
	state: StateDocument,
	options: PolicyOptions = {},
): NodeId[] {
	const resolved = resolvePolicy(options);
	if (resolved === undefined) return [];

	return map.nodes
		.filter((node) =>
			resolved.canComplete({
				map,
				state,
				nodeId: node.id,
				status: getNodeStatus(map, state, node.id),
			}),
		)
		.map((node) => node.id);
}

export function uncomplete(state: StateDocument, nodeId: NodeId): StateDocument {
	if (state.completed[nodeId] === undefined) return state;
	const { [nodeId]: _removed, ...rest } = state.completed;
	return { ...state, completed: rest };
}

function resolvePolicy(options: CompleteOptions): ProgressionPolicyDefinition | undefined {
	const policy = options.policy ?? SINGLE_ROUTE;

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
