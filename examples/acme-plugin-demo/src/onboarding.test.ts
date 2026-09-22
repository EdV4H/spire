import { complete, createSpire, emptyState, validateMap } from "@edv4h/spire-core";
import { createGenPlugin, type GenSpecInput, generate } from "@edv4h/spire-gen";
import { defaultTheme, renderToSVG, type SpireTheme } from "@edv4h/spire-render/headless";
import { describe, expect, it } from "vitest";
import { createOnboardingPlugin, createRenderPlugin, onboardingService } from "./index.js";

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
	return createSpire({
		plugins: [createGenPlugin(), createRenderPlugin(), createOnboardingPlugin()],
	});
}

/** Points the `checkpoint` type at the third-party renderer, by id. */
const badgeTheme: SpireTheme = {
	...defaultTheme,
	node: {
		...defaultTheme.node,
		checkpoint: { ...defaultTheme.node.default, renderer: "acme:badge" },
	},
};

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

/**
 * Rendering, from a package with no React dependency.
 *
 * This is the claim the shape vocabulary makes: a renderer registered by a
 * third party is drawn by `renderToSVG` exactly as it is on screen. If node
 * art only worked through React, a server could not produce the same image,
 * and the whole registry would be decoration.
 */
describe("third-party rendering", () => {
	it("draws a registered renderer into the static SVG", async () => {
		const spire = await acmeSpire();
		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const result = await generate(spec, { spire: spire.value });
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const map = result.value;
		const state = emptyState(map);
		const checkpoints = map.nodes.filter((n) => n.type === "checkpoint");
		expect(checkpoints.length).toBeGreaterThan(0);

		const svg = renderToSVG(map, state, { theme: badgeTheme, spire: spire.value });

		// The badge is two concentric circles, so every checkpoint contributes an
		// extra circle over the theme's default single one.
		const circles = svg.match(/<circle /g) ?? [];
		expect(circles).toHaveLength(map.nodes.length + checkpoints.length);
	});

	it("falls back to the theme's circle when the renderer is not registered", async () => {
		const withoutAcme = await createSpire({
			plugins: [createGenPlugin(), createRenderPlugin()],
		});
		if (!withoutAcme.ok) return;

		const spire = await acmeSpire();
		if (!spire.ok) return;
		const result = await generate(spec, { spire: spire.value });
		if (!result.ok) return;

		// Same theme, same map, but the plugin that owns "acme:badge" is absent.
		// An unregistered id must not blank the map.
		const svg = renderToSVG(result.value, emptyState(result.value), {
			theme: badgeTheme,
			spire: withoutAcme.value,
		});
		expect(svg.match(/<circle /g)).toHaveLength(result.value.nodes.length);
	});

	it("shows the copy only once a node is completed", async () => {
		const spire = await acmeSpire();
		if (!spire.ok) return;
		const result = await generate(spec, { spire: spire.value });
		if (!result.ok) return;

		const map = result.value;
		const options = { theme: badgeTheme, spire: spire.value };
		expect(renderToSVG(map, emptyState(map), options)).not.toContain("<text");

		const start = map.nodes.find((n) => n.position.row === 0 && n.type === "checkpoint");
		const done =
			start === undefined
				? undefined
				: complete(map, emptyState(map), start.id, { spire: spire.value });
		if (done?.ok !== true) return;

		expect(renderToSVG(map, done.value, options)).toContain("<text");
	});
});
