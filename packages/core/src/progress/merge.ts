import type { CompletionRecord, StateDocument } from "../types.js";

/**
 * CRDT-style merge of two progress states.
 *
 * The completion set is a grow-only map: completions union, and a node claimed
 * by both sides keeps the *earliest* record. Two peers that saw the same
 * completions in different orders therefore converge on the same document
 * without a coordinator (design doc §2.2).
 *
 * "Earliest" alone is not enough to make the merge commutative — two records
 * can share a timestamp. The tie-break is a total order over the record's
 * content (`by`, then a stable serialization of `data`), so the winner does not
 * depend on argument order. `mergeStates(a, b)` and `mergeStates(b, a)` are
 * deep-equal; the property tests pin that, along with associativity and
 * idempotence.
 */
export function mergeStates(a: StateDocument, b: StateDocument): StateDocument {
	const completed: Record<string, CompletionRecord> = { ...a.completed };

	for (const [nodeId, incoming] of Object.entries(b.completed)) {
		const existing = completed[nodeId];
		completed[nodeId] = existing === undefined ? incoming : earlier(existing, incoming);
	}

	// Fields the SDK does not know about (a newer minor version, or host
	// extensions) are unioned with the same order-independent tie-break, so the
	// whole document — not just `completed` — merges commutatively.
	const rest = mergeUnknownFields(a, b);

	return {
		...rest,
		smfVersion: a.smfVersion,
		mapId: a.mapId,
		completed: sortKeys(completed),
		...(a.meta === undefined && b.meta === undefined
			? {}
			: { meta: mergeUnknownFields(a.meta ?? {}, b.meta ?? {}) }),
	};
}

function mergeUnknownFields(
	a: Record<string, unknown>,
	b: Record<string, unknown>,
): Record<string, unknown> {
	const merged: Record<string, unknown> = {};
	for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
		const inA = Object.hasOwn(a, key);
		const inB = Object.hasOwn(b, key);
		if (inA && inB) {
			merged[key] = stableStringify(a[key]) <= stableStringify(b[key]) ? a[key] : b[key];
		} else {
			merged[key] = inA ? a[key] : b[key];
		}
	}
	return merged;
}

function earlier(a: CompletionRecord, b: CompletionRecord): CompletionRecord {
	if (a.at !== b.at) return a.at < b.at ? a : b;

	const byA = a.by ?? "";
	const byB = b.by ?? "";
	if (byA !== byB) return byA < byB ? a : b;

	// Last resort so the result cannot depend on argument order.
	return stableStringify(a.data) <= stableStringify(b.data) ? a : b;
}

/**
 * Key-order-independent serialization. `JSON.stringify` preserves insertion
 * order, which would make the tie-break depend on how each peer happened to
 * build the object.
 */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

	const entries = Object.entries(value as Record<string, unknown>).sort(([x], [y]) =>
		x < y ? -1 : x > y ? 1 : 0,
	);
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Deterministic key order, so merged documents serialize identically. */
function sortKeys(record: Record<string, CompletionRecord>): Record<string, CompletionRecord> {
	const sorted: Record<string, CompletionRecord> = {};
	for (const key of Object.keys(record).sort()) {
		const value = record[key];
		if (value !== undefined) sorted[key] = value;
	}
	return sorted;
}
