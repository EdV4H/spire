import { createSpire } from "@edv4h/spire-core";
import { createGenPlugin, type GenSpecInput, generate } from "@edv4h/spire-gen";
import { describe, expect, it } from "vitest";
import { createRulesExtraPlugin } from "./index.js";

async function spireWithExtras() {
	return createSpire({ plugins: [createRulesExtraPlugin(), createGenPlugin()] });
}

function specWith(constraints: { rule: string; [key: string]: unknown }[]): GenSpecInput {
	return {
		seed: 42,
		skeleton: { grid: { cols: 5, rows: 10 }, walks: 4, minStarts: 2 },
		types: {
			distribution: { step: 0.6, gate: 0.25, boss: 0.15 },
			constraints: [{ rule: "fixedRow", row: -1, type: "final" }, ...constraints],
		},
	};
}

describe("rules-extra plugin", () => {
	it("sets up after the generation plugin regardless of list order", async () => {
		const spire = await spireWithExtras();

		expect(spire.ok).toBe(true);
		if (!spire.ok) return;
		expect(spire.value.plugins.getAll().map((p) => p.id)).toEqual([
			"@edv4h/spire-gen",
			"@edv4h/spire-plugin-rules-extra",
		]);
	});

	it("fails with a named error when the generation plugin is absent", async () => {
		const spire = await createSpire({ plugins: [createRulesExtraPlugin()] });

		expect(spire.ok).toBe(false);
		if (spire.ok) return;
		expect(spire.error[0]?.code).toBe("missing_dependency");
	});

	it("removes its rules on teardown", async () => {
		const spire = await spireWithExtras();
		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const before = await generate(specWith([{ rule: "maxTotal", type: "boss", max: 2 }]), {
			spire: spire.value,
		});
		expect(before.ok).toBe(true);

		await spire.value.destroy();

		const after = await generate(specWith([{ rule: "maxTotal", type: "boss", max: 2 }]), {
			spire: spire.value,
		});
		expect(after.ok).toBe(false);
		if (after.ok) return;
		expect(after.error.message).toContain("maxTotal");
	});
});

describe("maxTotal", () => {
	it("caps how many nodes of a type the map gets", async () => {
		const spire = await spireWithExtras();
		if (!spire.ok) return;

		const result = await generate(specWith([{ rule: "maxTotal", type: "boss", max: 2 }]), {
			spire: spire.value,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.nodes.filter((n) => n.type === "boss").length).toBeLessThanOrEqual(2);
	});
});

describe("rowRange", () => {
	it("keeps a type inside its window, counting negatives from the end", async () => {
		const spire = await spireWithExtras();
		if (!spire.ok) return;

		const result = await generate(
			specWith([{ rule: "rowRange", type: "gate", minRow: 2, maxRow: -3 }]),
			{ spire: spire.value },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const terminalRow = result.value.grid.rows - 1;
		for (const node of result.value.nodes) {
			if (node.type !== "gate") continue;
			expect(node.position.row).toBeGreaterThanOrEqual(2);
			expect(node.position.row).toBeLessThanOrEqual(terminalRow - 2);
		}
	});

	it("rejects a window with neither bound", async () => {
		const spire = await spireWithExtras();
		if (!spire.ok) return;

		const result = await generate(specWith([{ rule: "rowRange", type: "gate" }]), {
			spire: spire.value,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("assign_failed");
	});
});

describe("afterTypes", () => {
	it("only places a type after an allowed predecessor", async () => {
		const spire = await spireWithExtras();
		if (!spire.ok) return;

		const result = await generate(
			specWith([{ rule: "afterTypes", type: "boss", after: ["gate"] }]),
			{ spire: spire.value },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const typeOf = new Map(result.value.nodes.map((n) => [n.id, n.type]));
		const predecessors = new Map<string, string[]>();
		for (const edge of result.value.edges) {
			const list = predecessors.get(edge.to);
			if (list === undefined) predecessors.set(edge.to, [edge.from]);
			else list.push(edge.from);
		}

		for (const node of result.value.nodes) {
			if (node.type !== "boss") continue;
			const parents = predecessors.get(node.id) ?? [];
			expect(parents.length).toBeGreaterThan(0);
			expect(parents.some((id) => typeOf.get(id) === "gate")).toBe(true);
		}
	});
});
