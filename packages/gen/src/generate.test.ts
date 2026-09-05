import { checkInvariants, createSpire, validateMap } from "@edv4h/spire-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { createGenPlugin } from "./plugin.js";
import { type ContentProvider, getGenRegistries } from "./registries.js";
import type { GenSpecInput } from "./spec.js";
import { validateConstraints } from "./validate.js";

function baseSpec(overrides: Partial<GenSpecInput> = {}): GenSpecInput {
	return {
		seed: 42,
		skeleton: { grid: { cols: 5, rows: 8 }, walks: 4, minStarts: 2 },
		types: {
			distribution: { step: 0.7, gate: 0.2, bonus: 0.1 },
			constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
		},
		...overrides,
	};
}

describe("generate — determinism", () => {
	it("produces the same map for the same seed", async () => {
		const a = await generate(baseSpec());
		const b = await generate(baseSpec());

		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.value).toEqual(b.value);
	});

	it("produces a different map for a different seed", async () => {
		const a = await generate(baseSpec({ seed: 1 }));
		const b = await generate(baseSpec({ seed: 2 }));

		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.value).not.toEqual(b.value);
	});

	it("matches the recorded map for seed 42", async () => {
		const result = await generate(baseSpec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchSnapshot();
	});
});

describe("generate — structure", () => {
	it("emits a map that passes its own validator", async () => {
		const result = await generate(baseSpec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(validateMap(result.value).ok).toBe(true);
	});

	it("uses the requested grid and derives the map id from the seed", async () => {
		const result = await generate(baseSpec({ seed: 7 }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.grid).toEqual({ cols: 5, rows: 8 });
		expect(result.value.seed).toBe(7);
		expect(result.value.id).toMatch(/^map_[0-9a-f]{4}$/);
	});

	it("honours minStarts", async () => {
		const result = await generate(baseSpec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const startCols = new Set(
			result.value.nodes.filter((n) => n.position.row === 0).map((n) => n.position.col),
		);
		expect(startCols.size).toBeGreaterThanOrEqual(2);
	});

	it("leaves empty cells for later insertion when walks < cols", async () => {
		const result = await generate(baseSpec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const cells = result.value.grid.cols * result.value.grid.rows;
		expect(result.value.nodes.length).toBeLessThan(cells);
	});

	it("passes spec.meta through to the document", async () => {
		const result = await generate(baseSpec({ meta: { theme: "onboarding" } }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.meta).toEqual({ theme: "onboarding" });
	});
});

describe("generate — constraints", () => {
	it("puts the pinned type on the terminal row and nowhere else", async () => {
		const result = await generate(baseSpec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const terminalRow = result.value.grid.rows - 1;
		for (const node of result.value.nodes) {
			expect(node.type === "final").toBe(node.position.row === terminalRow);
		}
	});

	it("respects minRow", async () => {
		const result = await generate(
			baseSpec({
				types: {
					distribution: { step: 0.6, gate: 0.4 },
					constraints: [
						{ rule: "fixedRow", row: -1, type: "final" },
						{ rule: "minRow", type: "gate", row: 3 },
					],
				},
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		for (const node of result.value.nodes) {
			if (node.type === "gate") expect(node.position.row).toBeGreaterThanOrEqual(3);
		}
	});

	it("respects noAdjacentSame", async () => {
		const spec = baseSpec({
			types: {
				distribution: { step: 0.6, gate: 0.4 },
				constraints: [
					{ rule: "fixedRow", row: -1, type: "final" },
					{ rule: "noAdjacentSame", types: ["gate"] },
				],
			},
		});
		const result = await generate(spec);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const typeOf = new Map(result.value.nodes.map((n) => [n.id, n.type]));
		for (const edge of result.value.edges) {
			const both = typeOf.get(edge.from) === "gate" && typeOf.get(edge.to) === "gate";
			expect(both).toBe(false);
		}
	});

	it("reports an unregistered rule by name", async () => {
		const result = await generate(
			baseSpec({
				types: { distribution: { step: 1 }, constraints: [{ rule: "no-such-rule" }] },
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("assign_failed");
		expect(result.error.message).toContain("no-such-rule");
	});

	it("terminates on contradictory constraints instead of hanging", async () => {
		const result = await generate(
			baseSpec({
				types: {
					distribution: { step: 1 },
					constraints: [
						{ rule: "fixedRow", row: 0, type: "alpha" },
						{ rule: "fixedRow", row: 0, type: "beta" },
					],
				},
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("assign_failed");
		expect(result.error.message).toContain("attempts");
	}, 10_000);

	it("re-checks a finished map with the same rule implementation", async () => {
		const spec = baseSpec();
		const result = await generate(spec);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const spire = await createSpire({ plugins: [createGenPlugin()] });
		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const registries = getGenRegistries(spire.value);
		expect(registries).toBeDefined();
		if (registries === undefined) return;

		// A hand edit that breaks the pinned terminal row must be caught by the
		// same rule implementation that placed it during generation.
		const edited = {
			...result.value,
			nodes: result.value.nodes.map((n) => (n.type === "final" ? { ...n, type: "step" } : n)),
		};

		const constraints = spec.types.constraints ?? [];
		expect(validateConstraints(result.value, constraints, registries.rules)).toHaveLength(0);
		expect(validateConstraints(edited, constraints, registries.rules).length).toBeGreaterThan(0);
	});
});

describe("generate — content", () => {
	it("merges provider output into node.data", async () => {
		const provider: ContentProvider = {
			id: "test:titles",
			provide: async (slots) =>
				slots.map((slot) => ({ nodeId: slot.nodeId, data: { title: `${slot.type}@${slot.row}` } })),
		};

		const spire = await createSpire({
			plugins: [createGenPlugin({ contentProviders: [provider] })],
		});
		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const result = await generate(baseSpec({ populate: "test:titles" }), { spire: spire.value });
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		for (const node of result.value.nodes) {
			expect(node.data?.title).toBe(`${node.type}@${node.position.row}`);
		}
	});

	it("only tells the provider about structure", async () => {
		let seenKeys: string[] = [];
		const provider: ContentProvider = {
			id: "test:spy",
			provide: async (slots) => {
				seenKeys = [...new Set(slots.flatMap((slot) => Object.keys(slot)))].sort();
				return [];
			},
		};

		const spire = await createSpire({
			plugins: [createGenPlugin({ contentProviders: [provider] })],
		});
		if (!spire.ok) return;
		await generate(baseSpec({ populate: "test:spy" }), { spire: spire.value });

		expect(
			seenKeys.every((key) => ["branchGroup", "col", "nodeId", "row", "type"].includes(key)),
		).toBe(true);
	});

	it("rejects content for a node that does not exist", async () => {
		const provider: ContentProvider = {
			id: "test:bad",
			provide: async () => [{ nodeId: "not-a-node", data: {} }],
		};

		const spire = await createSpire({
			plugins: [createGenPlugin({ contentProviders: [provider] })],
		});
		if (!spire.ok) return;

		const result = await generate(baseSpec({ populate: "test:bad" }), { spire: spire.value });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("populate_failed");
	});

	it("names the missing provider", async () => {
		const result = await generate(baseSpec({ populate: "nope" }));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("unknown_provider");
		expect(result.error.message).toContain("nope");
	});
});

describe("generate — invariants hold across the spec space", () => {
	it("always produces a valid map", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					seed: fc.integer({ min: -100_000, max: 100_000 }),
					cols: fc.integer({ min: 2, max: 7 }),
					rows: fc.integer({ min: 2, max: 12 }),
					walks: fc.integer({ min: 1, max: 6 }),
					stepWeight: fc.integer({ min: 1, max: 9 }),
					gateWeight: fc.integer({ min: 1, max: 9 }),
				}),
				async (input) => {
					const result = await generate({
						seed: input.seed,
						skeleton: {
							grid: { cols: input.cols, rows: input.rows },
							walks: input.walks,
							minStarts: Math.min(input.cols, input.walks),
						},
						types: {
							distribution: { step: input.stepWeight, gate: input.gateWeight },
							constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
						},
					});

					expect(result.ok).toBe(true);
					if (!result.ok) return;
					expect(checkInvariants(result.value)).toEqual([]);
				},
			),
			{ numRuns: 120 },
		);
	}, 30_000);
});
