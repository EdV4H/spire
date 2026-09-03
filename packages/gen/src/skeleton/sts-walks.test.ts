import { checkInvariants } from "@edv4h/spire-core";
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

describe("sts-walks — starts", () => {
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

	it("leaves the terminal row unconstrained by default", async () => {
		const capped = await generate(specWith({ maxEnds: 1 }));
		const free = await generate(specWith({}));

		expect(capped.ok && free.ok).toBe(true);
		if (!capped.ok || !free.ok) return;
		expect(countOnRow(free.value.nodes, free.value.grid.rows - 1)).toBeGreaterThan(1);
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
