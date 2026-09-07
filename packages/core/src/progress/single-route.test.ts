import { describe, expect, it } from "vitest";
import { SMF_VERSION } from "../schema.js";
import type { MapDocument, NodeId, StateDocument } from "../types.js";
import { mergeStates } from "./merge.js";
import { complete, getCompletableNodes, uncomplete } from "./transitions.js";

/**
 * The default progression policy: one route through the map.
 *
 * The map that matters here is the smallest one with a real decision in it —
 * a branch that merges again — because every rule this policy has is about
 * what happens at those two points.
 *
 *      n3        row 2 (terminal)
 *     /  \
 *   n1    n2     row 1
 *     \  /
 *      n0        row 0
 */
function branchMap(): MapDocument {
	return {
		smfVersion: SMF_VERSION,
		id: "map_branch",
		seed: 1,
		grid: { cols: 3, rows: 3 },
		nodeTypes: [{ id: "step" }],
		nodes: [
			{ id: "n0", type: "step", position: { col: 1, row: 0 } },
			{ id: "n1", type: "step", position: { col: 0, row: 1 } },
			{ id: "n2", type: "step", position: { col: 2, row: 1 } },
			{ id: "n3", type: "step", position: { col: 1, row: 2 } },
		],
		edges: [
			{ id: "e0", from: "n0", to: "n1" },
			{ id: "e1", from: "n0", to: "n2" },
			{ id: "e2", from: "n1", to: "n3" },
			{ id: "e3", from: "n2", to: "n3" },
		],
	};
}

/** Two entry points that never meet, for the "one beginning" rule. */
function twoLaneMap(): MapDocument {
	return {
		smfVersion: SMF_VERSION,
		id: "map_lanes",
		seed: 1,
		grid: { cols: 2, rows: 2 },
		nodeTypes: [{ id: "step" }],
		nodes: [
			{ id: "a0", type: "step", position: { col: 0, row: 0 } },
			{ id: "b0", type: "step", position: { col: 1, row: 0 } },
			{ id: "a1", type: "step", position: { col: 0, row: 1 } },
			{ id: "b1", type: "step", position: { col: 1, row: 1 } },
		],
		edges: [
			{ id: "e0", from: "a0", to: "a1" },
			{ id: "e1", from: "b0", to: "b1" },
		],
	};
}

function emptyFor(map: MapDocument): StateDocument {
	return { smfVersion: SMF_VERSION, mapId: map.id, completed: {} };
}

/** Complete each id in order, failing the test on the first refusal. */
function walk(map: MapDocument, ids: readonly NodeId[]): StateDocument {
	let state = emptyFor(map);
	for (const [index, id] of ids.entries()) {
		const result = complete(map, state, id, { at: `2026-01-0${index + 1}T00:00:00Z` });
		expect(result.ok, `completing ${id}`).toBe(true);
		if (!result.ok) return state;
		state = result.value;
	}
	return state;
}

describe("single-route — the default", () => {
	it("is what complete uses when no policy is named", () => {
		const map = branchMap();
		const afterBranch = walk(map, ["n0", "n1"]);

		const refused = complete(map, afterBranch, "n2");

		expect(refused.ok).toBe(false);
		if (refused.ok) return;
		expect(refused.error.code).toBe("not_allowed");
		expect(refused.error.meta?.policy).toBe("single-route");
	});

	it("lets a whole route be walked", () => {
		const map = branchMap();
		const state = walk(map, ["n0", "n2", "n3"]);

		expect(Object.keys(state.completed).sort()).toEqual(["n0", "n2", "n3"]);
	});

	it("refuses the arm you turned away from", () => {
		const map = branchMap();
		const state = walk(map, ["n0", "n1"]);

		expect(complete(map, state, "n2").ok).toBe(false);
	});

	it("refuses a second entry point", () => {
		const map = twoLaneMap();
		const state = walk(map, ["a0"]);

		expect(complete(map, state, "b0").ok).toBe(false);
	});

	it("allows any entry point while nothing has been walked", () => {
		const map = twoLaneMap();

		expect(complete(map, emptyFor(map), "a0").ok).toBe(true);
		expect(complete(map, emptyFor(map), "b0").ok).toBe(true);
	});

	it("still refuses a locked node", () => {
		const map = branchMap();

		expect(complete(map, emptyFor(map), "n3").ok).toBe(false);
	});

	it("reopens the other arm once you step back", () => {
		const map = branchMap();
		const state = walk(map, ["n0", "n1"]);
		const stepped = uncomplete(state, "n1");

		expect(complete(map, stepped, "n2").ok).toBe(true);
	});

	it("refuses to extend a route that merging forked", () => {
		// `mergeStates` unions two players' progress, which is the one way a
		// completed set can arrive already branched. There is no single route to
		// extend, so the merge stands and the walk stops.
		const map = branchMap();
		const left = walk(map, ["n0", "n1"]);
		const right = walk(map, ["n0", "n2"]);
		const merged = mergeStates(left, right);

		expect(Object.keys(merged.completed).sort()).toEqual(["n0", "n1", "n2"]);
		expect(complete(map, merged, "n3").ok).toBe(false);
		expect(complete(map, merged, "n3", { policy: "strict" }).ok).toBe(true);
	});
});

describe("single-route — against the other built-ins", () => {
	it("is the only built-in that refuses the second arm", () => {
		const map = branchMap();
		const state = walk(map, ["n0", "n1"]);

		expect(complete(map, state, "n2", { policy: "strict" }).ok).toBe(true);
		expect(complete(map, state, "n2", { policy: "free" }).ok).toBe(true);
	});

	it("named explicitly, behaves as the default does", () => {
		const map = branchMap();
		const state = walk(map, ["n0", "n1"]);

		expect(complete(map, state, "n2", { policy: "single-route" }).ok).toBe(false);
	});
});

describe("getCompletableNodes", () => {
	it("narrows to the tip of the route", () => {
		const map = branchMap();
		const state = walk(map, ["n0", "n1"]);

		expect(getCompletableNodes(map, state)).toEqual(["n3"]);
		expect(getCompletableNodes(map, state, { policy: "strict" })).toEqual(["n2", "n3"]);
	});

	it("offers every entry point before the first step", () => {
		const map = twoLaneMap();

		expect(getCompletableNodes(map, emptyFor(map))).toEqual(["a0", "b0"]);
	});

	it("is empty under a policy nobody registered", () => {
		const map = branchMap();

		expect(getCompletableNodes(map, emptyFor(map), { policy: "nope" })).toEqual([]);
	});
});
