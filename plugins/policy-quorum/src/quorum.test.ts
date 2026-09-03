import {
	complete,
	createSpire,
	emptyState,
	type MapDocument,
	SMF_VERSION,
	type StateDocument,
} from "@edv4h/spire-core";
import { describe, expect, it } from "vitest";
import { createQuorumPolicyPlugin, parseQuorumConfig } from "./index.js";

/**
 * A map where `n4` merges two paths, which is the only shape a quorum can
 * meaningfully constrain.
 *
 *   row 2        n4
 *   row 1     n2    n3
 *   row 0        n1
 */
function diamondMap(): MapDocument {
	return {
		smfVersion: SMF_VERSION,
		id: "map_test",
		seed: 1,
		grid: { cols: 3, rows: 3 },
		nodeTypes: [{ id: "step" }],
		nodes: [
			{ id: "n1", type: "step", position: { col: 1, row: 0 } },
			{ id: "n2", type: "step", position: { col: 0, row: 1 } },
			{ id: "n3", type: "step", position: { col: 2, row: 1 } },
			{ id: "n4", type: "step", position: { col: 1, row: 2 } },
		],
		edges: [
			{ id: "e1", from: "n1", to: "n2" },
			{ id: "e2", from: "n1", to: "n3" },
			{ id: "e3", from: "n2", to: "n4" },
			{ id: "e4", from: "n3", to: "n4" },
		],
	};
}

function stateWith(map: MapDocument, ids: readonly string[]): StateDocument {
	const completed: StateDocument["completed"] = {};
	for (const id of ids) completed[id] = { at: "2026-01-01T00:00:00Z" };
	return { ...emptyState(map), completed };
}

describe("quorum policy", () => {
	it("registers under a policy id a host can name from configuration", async () => {
		const spire = await createSpire({ plugins: [createQuorumPolicyPlugin()] });

		expect(spire.ok).toBe(true);
		if (!spire.ok) return;
		expect(spire.value.policies.has("quorum")).toBe(true);
	});

	it("holds a merge node until enough predecessors are complete", async () => {
		const spire = await createSpire({ plugins: [createQuorumPolicyPlugin({ threshold: 2 })] });
		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const map = diamondMap();
		const options = { policy: "quorum", spire: spire.value, at: "2026-01-02T00:00:00Z" };

		// One path done: strict would already open n4, quorum does not.
		const onePath = stateWith(map, ["n1", "n2"]);
		expect(complete(map, onePath, "n4", options).ok).toBe(false);
		expect(complete(map, onePath, "n4", { ...options, policy: "strict" }).ok).toBe(true);

		const bothPaths = stateWith(map, ["n1", "n2", "n3"]);
		expect(complete(map, bothPaths, "n4", options).ok).toBe(true);
	});

	it("still opens start nodes", async () => {
		const spire = await createSpire({ plugins: [createQuorumPolicyPlugin({ threshold: 2 })] });
		if (!spire.ok) return;

		const map = diamondMap();
		const result = complete(map, emptyState(map), "n1", {
			policy: "quorum",
			spire: spire.value,
			at: "2026-01-02T00:00:00Z",
		});

		expect(result.ok).toBe(true);
	});

	it("does not strand a node with fewer predecessors than the threshold", async () => {
		const spire = await createSpire({ plugins: [createQuorumPolicyPlugin({ threshold: 3 })] });
		if (!spire.ok) return;

		const map = diamondMap();
		const state = stateWith(map, ["n1"]);

		// n2 has one predecessor and a threshold of 3; allowUnderfilled clamps it.
		expect(
			complete(map, state, "n2", {
				policy: "quorum",
				spire: spire.value,
				at: "2026-01-02T00:00:00Z",
			}).ok,
		).toBe(true);
	});

	it("strands it when the host turns clamping off", async () => {
		const spire = await createSpire({
			plugins: [createQuorumPolicyPlugin({ threshold: 3, allowUnderfilled: false })],
		});
		if (!spire.ok) return;

		const map = diamondMap();
		const state = stateWith(map, ["n1"]);

		expect(
			complete(map, state, "n2", {
				policy: "quorum",
				spire: spire.value,
				at: "2026-01-02T00:00:00Z",
			}).ok,
		).toBe(false);
	});

	it("can run several thresholds side by side", async () => {
		const spire = await createSpire({
			plugins: [createQuorumPolicyPlugin({ id: "quorum-2", threshold: 2 })],
		});

		expect(spire.ok).toBe(true);
		if (!spire.ok) return;
		expect(spire.value.policies.has("quorum-2")).toBe(true);
		expect(spire.value.policies.has("quorum")).toBe(false);
	});

	it("fills in defaults for a partial config", () => {
		expect(parseQuorumConfig()).toEqual({
			id: "quorum",
			threshold: 2,
			allowUnderfilled: true,
		});
	});
});
