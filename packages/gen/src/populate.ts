import type { NodeId } from "@edv4h/spire-core";
import type { ContentProvider, NodeContent, NodeSlot, Skeleton } from "./registries.js";

/**
 * Content injection.
 *
 * The SDK's whole involvement with content is this file: hand the provider
 * structural slots, check what comes back refers to real nodes, and merge it
 * into `node.data`. No prompt, no model, no domain vocabulary — a provider that
 * calls an LLM lives in the application, which is where the domain knowledge
 * belongs.
 */

export interface PopulateFailure {
	code: "unknown_node" | "duplicate_node" | "provider_failed";
	message: string;
	meta?: Record<string, unknown>;
}

export function buildSlots(skeleton: Skeleton, assigned: ReadonlyMap<NodeId, string>): NodeSlot[] {
	const successors = new Map<NodeId, NodeId[]>();
	for (const edge of skeleton.edges) {
		const list = successors.get(edge.from);
		if (list === undefined) successors.set(edge.from, [edge.to]);
		else list.push(edge.to);
	}

	const branchGroupOf = new Map<NodeId, NodeId[]>();
	for (const children of successors.values()) {
		if (children.length < 2) continue;
		for (const child of children) branchGroupOf.set(child, children);
	}

	return skeleton.nodes.map((node) => {
		const group = branchGroupOf.get(node.id);
		return {
			nodeId: node.id,
			type: assigned.get(node.id) ?? "",
			row: node.position.row,
			col: node.position.col,
			...(group === undefined ? {} : { branchGroup: group }),
		};
	});
}

/**
 * Run a provider over the slots and validate its answer.
 *
 * A provider is third-party code, so its output is treated as untrusted input:
 * an id that does not exist, or two entries for the same node, is an error
 * rather than something to merge and hope for.
 */
export async function populate(
	provider: ContentProvider,
	slots: readonly NodeSlot[],
): Promise<
	{ ok: true; value: Map<NodeId, Record<string, unknown>> } | { ok: false; error: PopulateFailure }
> {
	let contents: readonly NodeContent[];
	try {
		contents = await provider.provide(slots);
	} catch (error) {
		return {
			ok: false,
			error: {
				code: "provider_failed",
				message: `Content provider "${provider.id}" threw while producing content.`,
				meta: { provider: provider.id, cause: String(error) },
			},
		};
	}

	const known = new Set(slots.map((slot) => slot.nodeId));
	const byNode = new Map<NodeId, Record<string, unknown>>();

	for (const content of contents) {
		if (!known.has(content.nodeId)) {
			return {
				ok: false,
				error: {
					code: "unknown_node",
					message: `Content provider "${provider.id}" returned content for "${content.nodeId}", which is not a node in this map.`,
					meta: { provider: provider.id, nodeId: content.nodeId },
				},
			};
		}
		if (byNode.has(content.nodeId)) {
			return {
				ok: false,
				error: {
					code: "duplicate_node",
					message: `Content provider "${provider.id}" returned two entries for node "${content.nodeId}".`,
					meta: { provider: provider.id, nodeId: content.nodeId },
				},
			};
		}
		byNode.set(content.nodeId, content.data);
	}

	return { ok: true, value: byNode };
}
