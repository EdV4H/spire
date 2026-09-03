import { type MapDocument, SMF_VERSION } from "@edv4h/spire-core";
import { describe, expect, it } from "vitest";
import { layout } from "./layout.js";

function diamondMap(seed: number | null = 42): MapDocument {
	return {
		smfVersion: SMF_VERSION,
		id: "map_test",
		seed,
		grid: { cols: 3, rows: 3 },
		nodeTypes: [{ id: "step" }, { id: "gate" }, { id: "final" }],
		nodes: [
			{ id: "n1", type: "step", position: { col: 1, row: 0 } },
			{ id: "n2", type: "step", position: { col: 0, row: 1 } },
			{ id: "n3", type: "gate", position: { col: 2, row: 1 } },
			{ id: "n4", type: "final", position: { col: 1, row: 2 } },
		],
		edges: [
			{ id: "e1", from: "n1", to: "n2" },
			{ id: "e2", from: "n1", to: "n3" },
			{ id: "e3", from: "n2", to: "n4" },
			{ id: "e4", from: "n3", to: "n4" },
		],
	};
}

describe("layout — orientation", () => {
	it("puts row 0 at the bottom by default", () => {
		const result = layout(diamondMap());
		const start = result.nodes.n1?.center.y ?? 0;
		const end = result.nodes.n4?.center.y ?? 0;

		expect(start).toBeGreaterThan(end);
	});

	it("puts row 0 at the top for top-down", () => {
		const result = layout(diamondMap(), { orientation: "top-down" });
		const start = result.nodes.n1?.center.y ?? 0;
		const end = result.nodes.n4?.center.y ?? 0;

		expect(start).toBeLessThan(end);
	});

	it("swaps the axes for a horizontal orientation", () => {
		const vertical = layout(diamondMap(), { orientation: "top-down" });
		const horizontal = layout(diamondMap(), { orientation: "left-right" });

		expect(horizontal.size.width).toBe(vertical.size.height);
		expect(horizontal.size.height).toBe(vertical.size.width);
	});

	it("mirrors right-left against left-right", () => {
		const ltr = layout(diamondMap(), { orientation: "left-right" });
		const rtl = layout(diamondMap(), { orientation: "right-left" });

		expect(ltr.nodes.n1?.center.x).toBe(rtl.nodes.n4?.center.x);
		expect(ltr.nodes.n4?.center.x).toBe(rtl.nodes.n1?.center.x);
	});
});

describe("layout — jitter", () => {
	it("is a no-op when the amount is zero", () => {
		const plain = layout(diamondMap());
		const zero = layout(diamondMap(), { jitter: { amount: 0 } });

		expect(zero.nodes).toEqual(plain.nodes);
	});

	it("is reproducible from the map's own seed", () => {
		const a = layout(diamondMap(), { jitter: { amount: 12 } });
		const b = layout(diamondMap(), { jitter: { amount: 12 } });

		expect(a.nodes).toEqual(b.nodes);
	});

	it("changes with the seed", () => {
		const a = layout(diamondMap(1), { jitter: { amount: 12 } });
		const b = layout(diamondMap(2), { jitter: { amount: 12 } });

		expect(a.nodes.n1?.center).not.toEqual(b.nodes.n1?.center);
	});

	it("keys displacement on the node id, not on iteration order", () => {
		const map = diamondMap();
		const reordered: MapDocument = { ...map, nodes: [...map.nodes].reverse() };

		const a = layout(map, { jitter: { amount: 12 } });
		const b = layout(reordered, { jitter: { amount: 12 } });

		expect(a.nodes.n1?.center).toEqual(b.nodes.n1?.center);
	});

	it("stays within the requested amount", () => {
		const plain = layout(diamondMap());
		const jittered = layout(diamondMap(), { jitter: { amount: 10 } });

		for (const [id, node] of Object.entries(jittered.nodes)) {
			const base = plain.nodes[id];
			expect(Math.abs(node.center.x - (base?.center.x ?? 0))).toBeLessThanOrEqual(10);
			expect(Math.abs(node.center.y - (base?.center.y ?? 0))).toBeLessThanOrEqual(10);
		}
	});
});

describe("layout — edges", () => {
	it("emits a cubic bezier per edge", () => {
		const result = layout(diamondMap());
		expect(Object.keys(result.edges)).toEqual(["e1", "e2", "e3", "e4"]);
		expect(result.edges.e1?.path).toMatch(/^M [\d.-]+ [\d.-]+ C /);
	});

	it("draws a straight line at zero curvature", () => {
		const result = layout(diamondMap(), { curvature: 0 });
		const edge = result.edges.e1;

		expect(edge?.control[0]).toEqual(edge?.start);
		expect(edge?.control[1]).toEqual(edge?.end);
	});

	it("skips an edge whose endpoints are missing rather than throwing", () => {
		const map = diamondMap();
		const broken: MapDocument = {
			...map,
			edges: [...map.edges, { id: "ghost", from: "n1", to: "nope" }],
		};

		expect(layout(broken).edges.ghost).toBeUndefined();
	});
});

describe("layout — snapshot", () => {
	it("matches the recorded geometry", () => {
		expect(layout(diamondMap(), { jitter: { amount: 8 } })).toMatchSnapshot();
	});
});
