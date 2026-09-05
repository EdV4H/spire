import {
	buildIndex,
	type PolicyContext,
	type ProgressionPolicyDefinition,
	SPIRE_PLUGIN_API_VERSION,
	type SpirePlugin,
} from "@edv4h/spire-core";
import { z } from "zod";

export const POLICY_QUORUM_PLUGIN_ID = "@edv4h/spire-plugin-policy-quorum";

export const quorumConfigSchema = z.looseObject({
	/** Policy id to register under. Change it to run several quorums at once. */
	id: z.string().min(1).default("quorum"),
	/** How many completed predecessors a node needs. */
	threshold: z.int().positive().default(2),
	/**
	 * Whether a node with fewer predecessors than `threshold` may be completed
	 * once all of them are done. With this off, a node reachable by a single
	 * path can never be completed under a threshold of 2 — usually a surprise
	 * rather than an intention.
	 */
	allowUnderfilled: z.boolean().default(true),
});

export type QuorumConfig = z.infer<typeof quorumConfigSchema>;
export type QuorumConfigInput = z.input<typeof quorumConfigSchema>;

export function parseQuorumConfig(input?: QuorumConfigInput): QuorumConfig {
	return quorumConfigSchema.parse(input ?? {});
}

/**
 * "Enough paths converged": a node opens once `threshold` of its predecessors
 * are complete, instead of just one.
 *
 * This is the shape of progression the built-in policies cannot express, and
 * it is a good demonstration of why policies are registered by id: a host
 * stores `{ "policy": "quorum" }` in its own configuration and calls
 * `complete(map, state, id, { policy: "quorum", spire })` — no code path in the
 * application changes when the rule does.
 */
export function createQuorumPolicy(config: QuorumConfig): ProgressionPolicyDefinition {
	return {
		id: config.id,
		canComplete(ctx: PolicyContext): boolean {
			if (ctx.status === "completed") return false;

			const index = buildIndex(ctx.map);
			const predecessors = index.incoming.get(ctx.nodeId) ?? [];

			// Start nodes have nothing to wait for.
			if (predecessors.length === 0) {
				return index.nodesById.get(ctx.nodeId)?.position.row === 0;
			}

			let completed = 0;
			for (const predecessor of predecessors) {
				if (ctx.state.completed[predecessor] !== undefined) completed += 1;
			}

			const needed = config.allowUnderfilled
				? Math.min(config.threshold, predecessors.length)
				: config.threshold;

			return completed >= needed;
		},
	};
}

export function createQuorumPolicyPlugin(input?: QuorumConfigInput): SpirePlugin {
	const config = parseQuorumConfig(input);

	return {
		id: POLICY_QUORUM_PLUGIN_ID,
		name: "Quorum progression policy",
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		setup(ctx) {
			return ctx.policies.register(createQuorumPolicy(config));
		},
	};
}
