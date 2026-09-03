import { complete, createSpire, emptyState, validateMap } from "@edv4h/spire-core";
import { createGenPlugin, type GenSpecInput, generate } from "@edv4h/spire-gen";
import { describe, expect, it } from "vitest";
import { createOnboardingPlugin, onboardingService } from "./index.js";

/**
 * The point of these tests is not the plugin — it is that a package outside the
 * SDK's own scope can add a node type, a rule, a policy, a content provider and
 * a service, and that the resulting GenSpec is still plain JSON.
 */

const spec: GenSpecInput = {
	seed: 7,
	skeleton: { grid: { cols: 5, rows: 9 }, walks: 4, minStarts: 2 },
	types: {
		distribution: { step: 0.7, checkpoint: 0.3 },
		constraints: [
			{ rule: "fixedRow", row: -1, type: "final" },
			{ rule: "acme:spacing", type: "checkpoint", gap: 2 },
		],
	},
	populate: "acme:onboarding-copy",
};

async function acmeSpire() {
	return createSpire({ plugins: [createGenPlugin(), createOnboardingPlugin()] });
}

describe("third-party extension", () => {
	it("generates with a rule and a provider the SDK has never heard of", async () => {
		const spire = await acmeSpire();
		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const result = await generate(spec, { spire: spire.value });
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(validateMap(result.value, spire.value).ok).toBe(true);
		expect(result.value.nodes.every((n) => typeof n.data?.title === "string")).toBe(true);
	});

	it("keeps the whole spec serialisable as JSON", () => {
		// Nothing in the spec is a function, so it survives storage verbatim.
		expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
	});

	it("applies the third-party spacing rule", async () => {
		const spire = await acmeSpire();
		if (!spire.ok) return;

		const result = await generate(spec, { spire: spire.value });
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const rows = result.value.nodes
			.filter((n) => n.type === "checkpoint")
			.map((n) => n.position.row)
			.sort((a, b) => a - b);

		for (let i = 1; i < rows.length; i++) {
			expect((rows[i] ?? 0) - (rows[i - 1] ?? 0)).toBeGreaterThanOrEqual(2);
		}
	});

	it("validates node.data against the type the plugin registered", async () => {
		const spire = await acmeSpire();
		if (!spire.ok) return;

		const result = await generate(spec, { spire: spire.value });
		if (!result.ok) return;

		const broken = {
			...result.value,
			nodes: result.value.nodes.map((n) =>
				n.type === "checkpoint" ? { ...n, data: { title: 42 } } : n,
			),
		};

		const validated = validateMap(broken, spire.value);
		expect(validated.ok).toBe(false);
		if (validated.ok) return;
		expect(validated.error[0]?.code).toBe("node_data");
	});

	it("exposes its progression policy by id", async () => {
		const spire = await acmeSpire();
		if (!spire.ok) return;

		const result = await generate(spec, { spire: spire.value });
		if (!result.ok) return;
		const map = result.value;

		const merge = map.nodes.find((n) => map.edges.filter((e) => e.to === n.id).length > 1);
		if (merge === undefined) return; // nothing to assert on this seed

		const oneParent = map.edges.find((e) => e.to === merge.id)?.from ?? "";
		const partial = {
			...emptyState(map),
			completed: { [oneParent]: { at: "2026-01-01T00:00:00Z" } },
		};

		const options = { spire: spire.value, at: "2026-01-02T00:00:00Z" };
		expect(complete(map, partial, merge.id, { ...options, policy: "strict" }).ok).toBe(true);
		expect(complete(map, partial, merge.id, { ...options, policy: "acme:sequential" }).ok).toBe(
			false,
		);
	});

	it("shares its own API through the service registry", async () => {
		const spire = await acmeSpire();
		if (!spire.ok) return;

		expect(onboardingService.get(spire.value.services)?.copyFor("step", 0)).toBe("step step 1");
	});
});
