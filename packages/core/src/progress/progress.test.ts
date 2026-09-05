import { describe, expect, it } from "vitest";
import { diamondMap, stateOf } from "../__fixtures__/maps.js";
import { createSpire } from "../plugin/create-spire.js";
import { SPIRE_PLUGIN_API_VERSION } from "../plugin/plugin.js";
import { emptyState } from "../validate/state.js";
import { getNodeStatus, getProgress, getReachableNodes } from "./status.js";
import { complete, uncomplete } from "./transitions.js";

describe("getNodeStatus", () => {
	it("treats every row-0 node as reachable with nothing completed", () => {
		const map = diamondMap();
		const state = emptyState(map);

		expect(getNodeStatus(map, state, "n1")).toBe("reachable");
		expect(getNodeStatus(map, state, "n2")).toBe("locked");
		expect(getNodeStatus(map, state, "n4")).toBe("locked");
	});

	it("unlocks direct successors of a completed node", () => {
		const map = diamondMap();
		const state = stateOf(map, { n1: "2026-01-01T00:00:00Z" });

		expect(getNodeStatus(map, state, "n1")).toBe("completed");
		expect(getNodeStatus(map, state, "n2")).toBe("reachable");
		expect(getNodeStatus(map, state, "n3")).toBe("reachable");
		expect(getNodeStatus(map, state, "n4")).toBe("locked");
	});

	it("needs only one completed predecessor at a merge", () => {
		const map = diamondMap();
		const state = stateOf(map, { n1: "2026-01-01T00:00:00Z", n2: "2026-01-02T00:00:00Z" });

		expect(getNodeStatus(map, state, "n4")).toBe("reachable");
	});

	it("reports an unknown node as locked rather than throwing", () => {
		const map = diamondMap();
		expect(getNodeStatus(map, emptyState(map), "nope")).toBe("locked");
	});
});

describe("getProgress", () => {
	it("derives counts, ratio and terminal arrival", () => {
		const map = diamondMap();
		const state = stateOf(map, {
			n1: "2026-01-01T00:00:00Z",
			n2: "2026-01-02T00:00:00Z",
			n4: "2026-01-03T00:00:00Z",
		});

		const progress = getProgress(map, state);
		expect(progress.completedCount).toBe(3);
		expect(progress.total).toBe(4);
		expect(progress.ratio).toBe(0.75);
		expect(progress.reachedTerminal).toBe(true);
		expect(progress.longestCompletedPath).toBe(3); // n1 → n2 → n4
	});

	it("counts a disconnected completion as a path of one", () => {
		const map = diamondMap();
		const state = stateOf(map, { n4: "2026-01-01T00:00:00Z" });

		expect(getProgress(map, state).longestCompletedPath).toBe(1);
	});

	it("lists reachable nodes", () => {
		const map = diamondMap();
		const state = stateOf(map, { n1: "2026-01-01T00:00:00Z" });

		expect(getReachableNodes(map, state).sort()).toEqual(["n2", "n3"]);
	});
});

describe("complete / uncomplete", () => {
	const at = "2026-01-01T00:00:00Z";

	it("completes a reachable node under the default strict policy", () => {
		const map = diamondMap();
		const result = complete(map, emptyState(map), "n1", { at });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.completed.n1?.at).toBe(at);
	});

	it("refuses a locked node under strict", () => {
		const map = diamondMap();
		const result = complete(map, emptyState(map), "n4", { at });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("not_allowed");
		expect(result.error.meta?.status).toBe("locked");
	});

	it("allows any node under free", () => {
		const map = diamondMap();
		expect(complete(map, emptyState(map), "n4", { at, policy: "free" }).ok).toBe(true);
	});

	it("accepts an inline predicate", () => {
		const map = diamondMap();
		const result = complete(map, emptyState(map), "n4", {
			at,
			policy: (ctx) => ctx.nodeId === "n4",
		});
		expect(result.ok).toBe(true);
	});

	it("rejects an unknown node", () => {
		const map = diamondMap();
		const result = complete(map, emptyState(map), "ghost", { at });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("unknown_node");
	});

	it("names the missing plugin when a policy id is not registered", () => {
		const map = diamondMap();
		const result = complete(map, emptyState(map), "n1", { at, policy: "quorum" });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("unknown_policy");
	});

	it("resolves a policy id registered by a plugin", async () => {
		const spire = await createSpire({
			plugins: [
				{
					id: "nothing-allowed",
					name: "nothing allowed",
					apiVersion: SPIRE_PLUGIN_API_VERSION,
					setup(ctx) {
						ctx.policies.register({ id: "frozen", canComplete: () => false });
					},
				},
			],
		});

		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const map = diamondMap();
		const result = complete(map, emptyState(map), "n1", {
			at,
			policy: "frozen",
			spire: spire.value,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("not_allowed");
	});

	it("does not mutate the state it was given", () => {
		const map = diamondMap();
		const state = emptyState(map);
		complete(map, state, "n1", { at });

		expect(Object.keys(state.completed)).toEqual([]);
	});

	it("is idempotent for completion followed by uncompletion", () => {
		const map = diamondMap();
		const state = emptyState(map);
		const completed = complete(map, state, "n1", { at });

		expect(completed.ok).toBe(true);
		if (!completed.ok) return;
		expect(uncomplete(completed.value, "n1")).toEqual(state);
	});

	it("returns the same object when uncompleting something not completed", () => {
		const map = diamondMap();
		const state = emptyState(map);
		expect(uncomplete(state, "n1")).toBe(state);
	});
});
