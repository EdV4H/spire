import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildMap, diamondMap } from "../__fixtures__/maps.js";
import { createSpire } from "../plugin/create-spire.js";
import { SPIRE_PLUGIN_API_VERSION } from "../plugin/plugin.js";
import type { MapDocument } from "../types.js";
import type { ValidationErrorCode } from "./errors.js";
import { validateMap } from "./map.js";

function codesFor(doc: MapDocument): ValidationErrorCode[] {
	const result = validateMap(doc);
	return result.ok ? [] : result.error.map((e) => e.code);
}

describe("validateMap — schema", () => {
	it("accepts a well-formed map", () => {
		expect(validateMap(diamondMap()).ok).toBe(true);
	});

	it("rejects a non-document", () => {
		const result = validateMap({ nope: true });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.every((e) => e.code === "schema")).toBe(true);
	});

	it("preserves unknown fields so a newer document survives a round trip", () => {
		const map = { ...diamondMap(), futureField: { anything: 1 } };
		const result = validateMap(map);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.value as Record<string, unknown>).futureField).toEqual({ anything: 1 });
	});

	it("preserves unknown fields inside nodes and edges", () => {
		const base = diamondMap();
		const map = {
			...base,
			nodes: base.nodes.map((node) => ({ ...node, futureNodeField: "keep" })),
		};

		const result = validateMap(map);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.value.nodes[0] as Record<string, unknown>).futureNodeField).toBe("keep");
	});
});

describe("validateMap — topological invariants", () => {
	it("flags a duplicate node id", () => {
		const map = buildMap({
			cols: 2,
			rows: 2,
			nodes: ["n1@0,0:step", "n1@1,0:step", "n2@0,1:step"],
			edges: ["n1>n2"],
		});
		expect(codesFor(map)).toContain("duplicate_id");
	});

	it("flags an edge pointing at a missing node", () => {
		const map = buildMap({
			cols: 1,
			rows: 2,
			nodes: ["n1@0,0:step", "n2@0,1:step"],
			edges: ["n1>ghost"],
		});
		expect(codesFor(map)).toContain("ref_integrity");
	});

	it("flags a node whose type is not declared", () => {
		const map = { ...diamondMap() };
		map.nodeTypes = map.nodeTypes.filter((t) => t.id !== "gate");
		expect(codesFor(map)).toContain("ref_integrity");
	});

	it("flags a node outside the grid", () => {
		const map = buildMap({
			cols: 2,
			rows: 2,
			nodes: ["n1@5,0:step", "n2@0,1:step"],
			edges: ["n1>n2"],
		});
		expect(codesFor(map)).toContain("position_range");
	});

	it("flags two nodes in one cell", () => {
		const map = buildMap({
			cols: 2,
			rows: 2,
			nodes: ["n1@0,0:step", "n2@0,0:step", "n3@0,1:step"],
			edges: ["n1>n3", "n2>n3"],
		});
		expect(codesFor(map)).toContain("position_collision");
	});

	it("flags an edge that does not run downward", () => {
		const map = buildMap({
			cols: 2,
			rows: 2,
			nodes: ["n1@0,0:step", "n2@1,0:step", "n3@0,1:step"],
			edges: ["n1>n2", "n1>n3", "n2>n3"],
		});
		expect(codesFor(map)).toContain("edge_direction");
	});

	it("flags a cycle", () => {
		const map: MapDocument = {
			...buildMap({
				cols: 1,
				rows: 3,
				nodes: ["n1@0,0:step", "n2@0,1:step", "n3@0,2:step"],
				edges: ["n1>n2", "n2>n3"],
			}),
		};
		map.edges = [...map.edges, { id: "back", from: "n3", to: "n1" }];
		expect(codesFor(map)).toContain("dag_cycle");
	});

	it("flags a node with no way in", () => {
		const map = buildMap({
			cols: 2,
			rows: 2,
			nodes: ["n1@0,0:step", "n2@0,1:step", "orphan@1,1:step"],
			edges: ["n1>n2"],
		});
		expect(codesFor(map)).toContain("degree_in");
	});

	it("flags a dead end above the terminal row", () => {
		const map = buildMap({
			cols: 2,
			rows: 3,
			nodes: ["n1@0,0:step", "dead@1,1:step", "n2@0,1:step", "n3@0,2:step"],
			edges: ["n1>n2", "n1>dead", "n2>n3"],
		});
		expect(codesFor(map)).toContain("degree_out");
	});

	it("flags crossing edges", () => {
		//   n3  n4     row 1
		//   n1  n2     row 0     n1→n4 and n2→n3 cross
		const map = buildMap({
			cols: 2,
			rows: 2,
			nodes: ["n1@0,0:step", "n2@1,0:step", "n3@0,1:step", "n4@1,1:step"],
			edges: ["n1>n4", "n2>n3"],
		});
		expect(codesFor(map)).toContain("edge_crossing");
	});

	it("does not flag a branch or a merge as a crossing", () => {
		expect(codesFor(diamondMap())).not.toContain("edge_crossing");
	});

	it("flags an edge that skips over a node in its path", () => {
		const map = buildMap({
			cols: 1,
			rows: 3,
			nodes: ["n1@0,0:step", "n2@0,1:step", "n3@0,2:step"],
			edges: ["n1>n2", "n2>n3", "n1>n3"],
		});
		expect(codesFor(map)).toContain("edge_through_node");
	});

	it("reports every violation, not just the first", () => {
		const map = buildMap({
			cols: 2,
			rows: 2,
			nodes: ["n1@9,0:step", "n2@9,0:step"],
			edges: [],
		});
		const codes = codesFor(map);
		expect(codes.length).toBeGreaterThan(2);
	});
});

describe("validateMap — with a Spire", () => {
	it("validates node.data against the schema its node type declared", async () => {
		const spire = await createSpire({
			plugins: [
				{
					id: "types",
					name: "types",
					apiVersion: SPIRE_PLUGIN_API_VERSION,
					setup(ctx) {
						ctx.nodeTypes.register({
							id: "gate",
							dataSchema: z.looseObject({ threshold: z.number() }),
						});
					},
				},
			],
		});

		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const map = diamondMap();
		const bad = {
			...map,
			nodes: map.nodes.map((n) => (n.type === "gate" ? { ...n, data: { threshold: "no" } } : n)),
		};

		expect(validateMap(map, spire.value).ok).toBe(false); // threshold missing
		const result = validateMap(bad, spire.value);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error[0]?.code).toBe("node_data");
	});

	it("runs plugin-registered validators", async () => {
		const spire = await createSpire({
			plugins: [
				{
					id: "no-gates",
					name: "no gates",
					apiVersion: SPIRE_PLUGIN_API_VERSION,
					setup(ctx) {
						ctx.validators.register({
							id: "no-gates",
							validate: ({ map }) =>
								map.nodes
									.filter((node) => node.type === "gate")
									.map((node) => ({
										code: "custom_no_gates",
										path: ["nodes"],
										message: `gate node ${node.id} is not allowed here`,
									})),
						});
					},
				},
			],
		});

		expect(spire.ok).toBe(true);
		if (!spire.ok) return;

		const result = validateMap(diamondMap(), spire.value);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error[0]?.code).toBe("custom_no_gates");
	});

	it("ignores plugin validators when no Spire is passed", () => {
		expect(validateMap(diamondMap()).ok).toBe(true);
	});
});
