import { checkInvariants, paths } from "@edv4h/spire-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generate } from "../generate.js";
import type { GenSpecInput } from "../spec.js";

/**
 * Funnel behaviour: how many nodes a map is allowed to start and finish on.
 *
 * `minStarts` alone was never enough to shape a map — it is a floor, so a spec
 * could ask for few entry points and still get many. `maxStarts` and `maxEnds`
 * are what let a map say "one beginning, one summit", which is the shape a goal
 * map wants.
 */

function specWith(skeleton: Partial<GenSpecInput["skeleton"]>): GenSpecInput {
	return {
		seed: 42,
		skeleton: { grid: { cols: 5, rows: 10 }, walks: 5, minStarts: 2, ...skeleton },
		types: {
			distribution: { step: 0.7, gate: 0.3 },
			constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
		},
	};
}

function countOnRow(nodes: readonly { position: { row: number } }[], row: number): number {
	return nodes.filter((node) => node.position.row === row).length;
}

describe("sts-walks — defaults", () => {
	it("gives a map one beginning and one finish when the spec says nothing", async () => {
		const result = await generate({
			seed: 42,
			skeleton: { grid: { cols: 5, rows: 10 }, walks: 5 },
			types: {
				distribution: { step: 1 },
				constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 0)).toBe(1);
		expect(countOnRow(result.value.nodes, result.value.grid.rows - 1)).toBe(1);
	});
});

describe("sts-walks — starts", () => {
	it("pins the count to minStarts when no cap is given", async () => {
		// A floor without a ceiling means "this many" — not "at least this many,
		// and however many more the walks happen to open".
		const result = await generate(specWith({ minStarts: 3 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 0)).toBe(3);
	});

	it("lifts the cap only for an explicit null", async () => {
		const result = await generate(specWith({ minStarts: 2, maxStarts: null, walks: 6 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 0)).toBeGreaterThan(2);
	});

	it("caps the number of entry columns", async () => {
		const result = await generate(specWith({ minStarts: 1, maxStarts: 1 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 0)).toBe(1);
	});

	it("still honours the floor when both are set", async () => {
		const result = await generate(specWith({ minStarts: 3, maxStarts: 3 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 0)).toBe(3);
	});

	it("rejects a cap below the floor rather than silently picking one", async () => {
		const result = await generate(specWith({ minStarts: 3, maxStarts: 1 }));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("skeleton_failed");
		expect(result.error.message).toContain("below minStarts");
	});

	it("keeps extra walks on columns that were already chosen", async () => {
		// The cap only means something if walk 6 cannot open a new lane.
		const result = await generate(specWith({ walks: 8, minStarts: 2, maxStarts: 2 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 0)).toBe(2);
	});
});

describe("sts-walks — ends", () => {
	it("funnels every route into a single terminal node", async () => {
		const result = await generate(specWith({ maxEnds: 1 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, result.value.grid.rows - 1)).toBe(1);
	});

	it("funnels by default, and only null lifts the cap", async () => {
		const byDefault = await generate(specWith({}));
		const uncapped = await generate(specWith({ maxEnds: null }));

		expect(byDefault.ok && uncapped.ok).toBe(true);
		if (!byDefault.ok || !uncapped.ok) return;

		expect(countOnRow(byDefault.value.nodes, byDefault.value.grid.rows - 1)).toBe(1);
		expect(countOnRow(uncapped.value.nodes, uncapped.value.grid.rows - 1)).toBeGreaterThan(1);
	});

	it("respects a wider landing block", async () => {
		const result = await generate(specWith({ maxEnds: 2, walks: 5 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, result.value.grid.rows - 1)).toBeLessThanOrEqual(2);
	});

	it("does not introduce a crossing while funnelling", async () => {
		const result = await generate(specWith({ maxEnds: 1, walks: 6, minStarts: 4 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(checkInvariants(result.value)).toEqual([]);
	});
});

describe("sts-walks — one beginning, one summit", () => {
	it("produces a map with exactly one entry and one finish", async () => {
		const result = await generate(specWith({ minStarts: 1, maxStarts: 1, maxEnds: 1, walks: 6 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(countOnRow(result.value.nodes, 0)).toBe(1);
		expect(countOnRow(result.value.nodes, result.value.grid.rows - 1)).toBe(1);
		expect(checkInvariants(result.value)).toEqual([]);
	});

	it("holds across the parameter space", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					seed: fc.integer({ min: -50_000, max: 50_000 }),
					cols: fc.integer({ min: 2, max: 7 }),
					rows: fc.integer({ min: 2, max: 14 }),
					walks: fc.integer({ min: 1, max: 8 }),
					maxEnds: fc.integer({ min: 1, max: 3 }),
				}),
				async (input) => {
					const result = await generate({
						seed: input.seed,
						skeleton: {
							grid: { cols: input.cols, rows: input.rows },
							walks: input.walks,
							minStarts: 1,
							maxStarts: 1,
							maxEnds: input.maxEnds,
						},
						types: {
							distribution: { step: 1 },
							constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
						},
					});

					expect(result.ok).toBe(true);
					if (!result.ok) return;

					const terminalRow = result.value.grid.rows - 1;
					expect(countOnRow(result.value.nodes, 0)).toBe(1);
					expect(countOnRow(result.value.nodes, terminalRow)).toBeLessThanOrEqual(
						Math.min(input.maxEnds, input.cols, input.walks),
					);
					expect(checkInvariants(result.value)).toEqual([]);
				},
			),
			{ numRuns: 150 },
		);
	}, 30_000);
});

describe("sts-walks — choke rows", () => {
	it("puts exactly one node on a choked row", async () => {
		const result = await generate(specWith({ chokeRows: [5], walks: 6, minStarts: 3 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 5)).toBe(1);
	});

	it("routes every path through it", async () => {
		// The count is the mechanism; this is the property that count is for.
		const result = await generate(specWith({ chokeRows: [4], walks: 6, minStarts: 3 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const choke = result.value.nodes.find((node) => node.position.row === 4);
		expect(choke).toBeDefined();

		const routes = paths(result.value);
		expect(routes.paths.length).toBeGreaterThan(1);
		for (const route of routes.paths) {
			expect(route).toContain(choke?.id);
		}
	});

	it("handles several choke rows at once", async () => {
		const result = await generate(specWith({ chokeRows: [3, 6], walks: 6, minStarts: 3 }));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(countOnRow(result.value.nodes, 3)).toBe(1);
		expect(countOnRow(result.value.nodes, 6)).toBe(1);
		expect(checkInvariants(result.value)).toEqual([]);
	});

	it("still produces a valid map, with no crossings", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					seed: fc.integer({ min: -20_000, max: 20_000 }),
					cols: fc.integer({ min: 2, max: 7 }),
					walks: fc.integer({ min: 1, max: 8 }),
					chokeRow: fc.integer({ min: 1, max: 8 }),
				}),
				async (input) => {
					const result = await generate({
						seed: input.seed,
						skeleton: {
							grid: { cols: input.cols, rows: 10 },
							walks: input.walks,
							minStarts: 1,
							maxStarts: null,
							chokeRows: [input.chokeRow],
						},
						types: {
							distribution: { step: 1 },
							constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
						},
					});

					expect(result.ok).toBe(true);
					if (!result.ok) return;
					expect(countOnRow(result.value.nodes, input.chokeRow)).toBe(1);
					expect(checkInvariants(result.value)).toEqual([]);
				},
			),
			{ numRuns: 150 },
		);
	}, 30_000);

	it("rejects a choke on row 0 or the terminal row", async () => {
		const first = await generate(specWith({ chokeRows: [0] }));
		const last = await generate(specWith({ chokeRows: [9] }));

		expect(first.ok).toBe(false);
		expect(last.ok).toBe(false);
		if (first.ok) return;
		expect(first.error.message).toContain("chokeRows must name rows");
	});

	it("rejects more entry points than a near choke can be reached from", async () => {
		// A choke at row 1 is one step from row 0, so at most three columns can
		// reach it. Caught up front rather than for unlucky seeds only.
		const result = await generate(specWith({ chokeRows: [1], minStarts: 4, walks: 5 }));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.message).toContain("cannot be reached from a choke at row 1");
	});
});

describe("sts-walks — maxEnds with unreachable starts", () => {
	it("keeps the cap when the grid is too short to walk across", async () => {
		// Regression: entry columns were drawn from the whole grid, so a start
		// that could not reach the landing block produced a terminal node of its
		// own and blew the cap. Two rows means one step, so nothing can travel.
		for (let seed = 0; seed < 25; seed++) {
			const result = await generate({
				seed,
				skeleton: {
					grid: { cols: 5, rows: 2 },
					walks: 5,
					minStarts: 4,
					maxStarts: 4,
					maxEnds: 1,
				},
				types: { distribution: { step: 1 }, constraints: [] },
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(countOnRow(result.value.nodes, 1), `seed ${seed}`).toBe(1);
		}
	});
});
