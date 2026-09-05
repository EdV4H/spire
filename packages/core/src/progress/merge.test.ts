import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CompletionRecord, StateDocument } from "../types.js";
import { mergeStates } from "./merge.js";

/**
 * `mergeStates` is the whole of Spire's multi-writer story, so its algebraic
 * laws are tested as properties rather than with examples: two peers that apply
 * the same completions in any order, any grouping, any number of times must end
 * up with the same document.
 */

const nodeIdArb = fc.constantFrom("n1", "n2", "n3", "n4");
const atArb = fc.constantFrom(
	"2026-01-01T00:00:00Z",
	"2026-01-02T00:00:00Z",
	"2026-01-03T00:00:00Z",
);

const recordArb: fc.Arbitrary<CompletionRecord> = fc.record(
	{
		at: atArb,
		by: fc.option(fc.constantFrom("alice", "bob"), { nil: undefined }),
		data: fc.option(fc.dictionary(fc.constantFrom("k1", "k2"), fc.integer({ min: 0, max: 3 })), {
			nil: undefined,
		}),
	},
	{ requiredKeys: ["at"] },
);

const stateArb: fc.Arbitrary<StateDocument> = fc
	.dictionary(nodeIdArb, recordArb)
	.map((completed) => ({ smfVersion: "0.1", mapId: "map_test", completed }));

describe("mergeStates — laws", () => {
	it("is commutative", () => {
		fc.assert(
			fc.property(stateArb, stateArb, (a, b) => {
				expect(mergeStates(a, b)).toEqual(mergeStates(b, a));
			}),
		);
	});

	it("is associative", () => {
		fc.assert(
			fc.property(stateArb, stateArb, stateArb, (a, b, c) => {
				expect(mergeStates(mergeStates(a, b), c)).toEqual(mergeStates(a, mergeStates(b, c)));
			}),
		);
	});

	it("is idempotent", () => {
		fc.assert(
			fc.property(stateArb, (a) => {
				const once = mergeStates(a, a);
				expect(mergeStates(once, once)).toEqual(once);
			}),
		);
	});

	it("never loses a completion", () => {
		fc.assert(
			fc.property(stateArb, stateArb, (a, b) => {
				const merged = mergeStates(a, b);
				const expected = new Set([...Object.keys(a.completed), ...Object.keys(b.completed)]);
				expect(new Set(Object.keys(merged.completed))).toEqual(expected);
			}),
		);
	});

	it("keeps the earliest timestamp for a node claimed by both peers", () => {
		fc.assert(
			fc.property(stateArb, stateArb, (a, b) => {
				const merged = mergeStates(a, b);
				for (const [nodeId, record] of Object.entries(merged.completed)) {
					const candidates = [a.completed[nodeId]?.at, b.completed[nodeId]?.at].filter(
						(at): at is string => at !== undefined,
					);
					expect(record.at).toBe(candidates.sort()[0]);
				}
			}),
		);
	});
});

describe("mergeStates — examples", () => {
	it("prefers the earlier record over the later one", () => {
		const early: StateDocument = {
			smfVersion: "0.1",
			mapId: "m",
			completed: { n1: { at: "2026-01-01T00:00:00Z", by: "alice" } },
		};
		const late: StateDocument = {
			smfVersion: "0.1",
			mapId: "m",
			completed: { n1: { at: "2026-06-01T00:00:00Z", by: "bob" } },
		};

		expect(mergeStates(early, late).completed.n1?.by).toBe("alice");
		expect(mergeStates(late, early).completed.n1?.by).toBe("alice");
	});

	it("breaks a timestamp tie the same way in both directions", () => {
		const a: StateDocument = {
			smfVersion: "0.1",
			mapId: "m",
			completed: { n1: { at: "2026-01-01T00:00:00Z", by: "bob" } },
		};
		const b: StateDocument = {
			smfVersion: "0.1",
			mapId: "m",
			completed: { n1: { at: "2026-01-01T00:00:00Z", by: "alice" } },
		};

		expect(mergeStates(a, b)).toEqual(mergeStates(b, a));
		expect(mergeStates(a, b).completed.n1?.by).toBe("alice");
	});

	it("orders completion keys deterministically", () => {
		const a: StateDocument = {
			smfVersion: "0.1",
			mapId: "m",
			completed: { n3: { at: "2026-01-01T00:00:00Z" }, n1: { at: "2026-01-01T00:00:00Z" } },
		};
		const b: StateDocument = {
			smfVersion: "0.1",
			mapId: "m",
			completed: { n2: { at: "2026-01-01T00:00:00Z" } },
		};

		expect(Object.keys(mergeStates(a, b).completed)).toEqual(["n1", "n2", "n3"]);
	});
});
