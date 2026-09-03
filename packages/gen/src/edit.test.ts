import { checkInvariants, emptyState, validateMap } from "@edv4h/spire-core";
import { describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { insertNode } from "./insert.js";
import { regenerate } from "./regenerate.js";
import type { GenSpecInput } from "./spec.js";

const spec: GenSpecInput = {
	seed: 42,
	skeleton: { grid: { cols: 5, rows: 8 }, walks: 3, minStarts: 2 },
	types: {
		distribution: { step: 0.7, gate: 0.3 },
		constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
	},
};

async function baseMap() {
	const result = await generate(spec);
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

describe("insertNode", () => {
	it("adds a node into a free cell and keeps the map valid", async () => {
		const map = await baseMap();
		const result = insertNode(map, { type: "step", row: 3 });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(validateMap(result.value.map).ok).toBe(true);
		expect(result.value.map.nodes.length).toBe(map.nodes.length + 1);
	});

	it("wires the new node in both directions on an interior row", async () => {
		const map = await baseMap();
		const result = insertNode(map, { type: "step", row: 3 });
		if (!result.ok) return;

		const { nodeId, map: next } = result.value;
		expect(next.edges.some((e) => e.to === nodeId)).toBe(true);
		expect(next.edges.some((e) => e.from === nodeId)).toBe(true);
	});

	it("prefers a free cell near the requested column", async () => {
		const map = await baseMap();
		const taken = new Set(map.nodes.filter((n) => n.position.row === 3).map((n) => n.position.col));
		const wanted = [0, 1, 2, 3, 4].find((col) => !taken.has(col)) ?? 0;

		const result = insertNode(map, { type: "step", row: 3, col: wanted });
		if (!result.ok) return;

		const inserted = result.value.map.nodes.find((n) => n.id === result.value.nodeId);
		expect(inserted?.position.col).toBe(wanted);
	});

	it("resolves a negative row from the end", async () => {
		const map = await baseMap();
		const result = insertNode(map, { type: "final", row: -1 });

		if (!result.ok) return;
		const inserted = result.value.map.nodes.find((n) => n.id === result.value.nodeId);
		expect(inserted?.position.row).toBe(map.grid.rows - 1);
	});

	it("refuses a type the map has not declared", async () => {
		const map = await baseMap();
		const result = insertNode(map, { type: "not-declared", row: 3 });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("unknown_type");
	});

	it("refuses a row outside the grid", async () => {
		const map = await baseMap();
		const result = insertNode(map, { type: "step", row: 99 });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("invalid_row");
	});

	it("reports no_space rather than emitting a broken map when a row is full", async () => {
		const dense = await generate({
			...spec,
			skeleton: { grid: { cols: 2, rows: 4 }, walks: 4, minStarts: 2 },
		});
		if (!dense.ok) return;

		const full = [0, 1, 2, 3].find(
			(row) => dense.value.nodes.filter((n) => n.position.row === row).length === 2,
		);
		if (full === undefined) return;

		const result = insertNode(dense.value, { type: "step", row: full });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("no_space");
	});

	it("never returns a map that fails an invariant", async () => {
		const map = await baseMap();
		for (let row = 0; row < map.grid.rows; row++) {
			const result = insertNode(map, { type: "step", row });
			if (!result.ok) continue;
			expect(checkInvariants(result.value.map)).toEqual([]);
		}
	});
});

describe("regenerate", () => {
	it("keeps completed nodes and reassigns the rest", async () => {
		const map = await baseMap();
		const completedId = map.nodes.find((n) => n.position.row === 0)?.id ?? "";
		const state = {
			...emptyState(map),
			completed: { [completedId]: { at: "2026-01-01T00:00:00Z" } },
		};
		const before = map.nodes.find((n) => n.id === completedId)?.type;

		const result = await regenerate(
			map,
			{
				...spec,
				seed: 99,
				types: { distribution: { step: 1 }, constraints: spec.types.constraints },
			},
			{ keepCompleted: state },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.nodes.find((n) => n.id === completedId)?.type).toBe(before);
		expect(validateMap(result.value).ok).toBe(true);
	});

	it("preserves structure exactly", async () => {
		const map = await baseMap();
		const result = await regenerate(map, { ...spec, seed: 99 }, { keepCompleted: emptyState(map) });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.edges).toEqual(map.edges);
		expect(result.value.nodes.map((n) => n.position)).toEqual(map.nodes.map((n) => n.position));
	});

	it("refuses a spec whose grid does not match the map", async () => {
		const map = await baseMap();
		const result = await regenerate(
			map,
			{ ...spec, skeleton: { ...spec.skeleton, grid: { cols: 9, rows: 9 } } },
			{ keepCompleted: emptyState(map) },
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("invalid_spec");
		expect(result.error.message).toContain("generate()");
	});

	it("reports a pinned node that the new spec would forbid as a warning, not a failure", async () => {
		const map = await baseMap();
		const gate = map.nodes.find((n) => n.type === "gate" && n.position.row < 5);
		if (gate === undefined) return;

		const state = {
			...emptyState(map),
			completed: { [gate.id]: { at: "2026-01-01T00:00:00Z" } },
		};

		// The new spec bans gates before row 6; the completed one is already there.
		const result = await regenerate(
			map,
			{
				...spec,
				types: {
					distribution: { step: 0.7, gate: 0.3 },
					constraints: [
						{ rule: "fixedRow", row: -1, type: "final" },
						{ rule: "minRow", type: "gate", row: 6 },
					],
				},
			},
			{ keepCompleted: state },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.meta?.regenerateWarnings).toBeDefined();
		expect(validateMap(result.value).ok).toBe(true);
	});

	it("is deterministic", async () => {
		const map = await baseMap();
		const state = emptyState(map);

		const a = await regenerate(map, { ...spec, seed: 5 }, { keepCompleted: state });
		const b = await regenerate(map, { ...spec, seed: 5 }, { keepCompleted: state });

		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.value).toEqual(b.value);
	});
});
