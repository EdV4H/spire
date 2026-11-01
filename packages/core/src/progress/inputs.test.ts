import { describe, expect, it } from "vitest";
import { diamondMap } from "../__fixtures__/maps.js";
import type { StateDocument } from "../types.js";
import { emptyState } from "../validate/state.js";
import { inputsOf } from "./inputs.js";
import { mergeStates } from "./merge.js";
import { complete } from "./transitions.js";

/** Completes nodes in order, each with an output, failing loudly if the policy refuses. */
const walk = (
	steps: [nodeId: string, output: unknown][],
	options: { policy?: "single-route" | "strict" } = {},
): StateDocument => {
	const map = diamondMap();
	let state = emptyState(map);
	steps.forEach(([nodeId, output], i) => {
		const result = complete(map, state, nodeId, {
			...options,
			at: `2026-01-0${i + 1}T00:00:00Z`,
			output,
		});
		if (!result.ok) throw new Error(result.error.message);
		state = result.value;
	});
	return state;
};

describe("complete — output", () => {
	it("records the output on the completion", () => {
		const state = walk([["n1", { card: "clear" }]]);
		expect(state.completed.n1?.output).toEqual({ card: "clear" });
	});

	it("leaves the field off when there is no output", () => {
		const map = diamondMap();
		const result = complete(map, emptyState(map), "n1", { at: "2026-01-01T00:00:00Z" });
		expect(result.ok && "output" in (result.value.completed.n1 ?? {})).toBe(false);
	});
});

describe("inputsOf", () => {
	it("hands a node the output of the predecessor it was reached through", () => {
		const map = diamondMap();
		const state = walk([["n1", { card: "clear" }]]);

		expect(inputsOf(map, state, "n2")).toEqual([{ from: "n1", output: { card: "clear" } }]);
		expect(inputsOf(map, state, "n3")).toEqual([{ from: "n1", output: { card: "clear" } }]);
	});

	it("follows the arm that was walked, not the one turned away from (single-route)", () => {
		const map = diamondMap();
		const state = walk([
			["n1", "start"],
			["n2", "left"],
		]);

		expect(inputsOf(map, state, "n4")).toEqual([{ from: "n2", output: "left" }]);
	});

	it("collects every completed arm at a merge when the policy allows both", () => {
		const map = diamondMap();
		const state = walk(
			[
				["n1", "start"],
				["n2", "left"],
				["n3", "right"],
			],
			{ policy: "strict" },
		);

		expect(inputsOf(map, state, "n4")).toEqual([
			{ from: "n2", output: "left" },
			{ from: "n3", output: "right" },
		]);
	});

	it("skips predecessors that handed nothing on, and works for start nodes", () => {
		const map = diamondMap();
		const result = complete(map, emptyState(map), "n1", { at: "2026-01-01T00:00:00Z" });
		if (!result.ok) throw new Error(result.error.message);

		expect(inputsOf(map, result.value, "n2")).toEqual([]);
		expect(inputsOf(map, result.value, "n1")).toEqual([]);
		expect(inputsOf(map, result.value, "nope")).toEqual([]);
	});
});

describe("mergeStates — output", () => {
	it("breaks a tie on output so the merge stays commutative", () => {
		const base = { smfVersion: "0.1", mapId: "map_test" };
		const a: StateDocument = {
			...base,
			completed: { n1: { at: "2026-01-01T00:00:00Z", output: "a" } },
		};
		const b: StateDocument = {
			...base,
			completed: { n1: { at: "2026-01-01T00:00:00Z", output: "b" } },
		};

		expect(mergeStates(a, b)).toEqual(mergeStates(b, a));
		// The lower stable serialization wins.
		expect(mergeStates(a, b).completed.n1?.output).toBe("a");
	});
});
