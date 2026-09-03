import { type MapDocument, SMF_VERSION, type StateDocument } from "@edv4h/spire-core";
import { describe, expect, it } from "vitest";
import { buildScene } from "./scene.js";
import { renderToSVG } from "./svg.js";
import { defaultTheme, type SpireTheme } from "./theme.js";

function diamondMap(): MapDocument {
	return {
		smfVersion: SMF_VERSION,
		id: "map_test",
		seed: 42,
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

function stateWith(ids: readonly string[]): StateDocument {
	const completed: StateDocument["completed"] = {};
	for (const id of ids) completed[id] = { at: "2026-01-01T00:00:00Z" };
	return { smfVersion: SMF_VERSION, mapId: "map_test", completed };
}

describe("buildScene", () => {
	it("resolves status per node from the map and state alone", () => {
		const scene = buildScene(diamondMap(), stateWith(["n1"]));
		const byId = new Map(scene.nodes.map((n) => [n.id, n.status]));

		expect(byId.get("n1")).toBe("completed");
		expect(byId.get("n2")).toBe("reachable");
		expect(byId.get("n4")).toBe("locked");
	});

	it("marks an edge completed only when both ends are", () => {
		const scene = buildScene(diamondMap(), stateWith(["n1", "n2"]));
		const byId = new Map(scene.edges.map((e) => [e.id, e.completed]));

		expect(byId.get("e1")).toBe(true); // n1 → n2
		expect(byId.get("e2")).toBe(false); // n1 → n3
	});

	it("takes styling from the theme, including per-type overrides", () => {
		const theme: SpireTheme = {
			...defaultTheme,
			node: {
				...defaultTheme.node,
				gate: { size: 24, fill: "#fde68a", stroke: "#b45309", strokeWidth: 2 },
			},
		};

		const scene = buildScene(diamondMap(), stateWith([]), { theme });
		const gate = scene.nodes.find((n) => n.type === "gate");

		expect(gate?.fill).toBe("#fde68a");
		expect(gate?.radius).toBe(24);
	});

	it("falls back to the default style for an unstyled type", () => {
		const scene = buildScene(diamondMap(), stateWith([]));
		const final = scene.nodes.find((n) => n.type === "final");

		expect(final?.fill).toBe(defaultTheme.node.default.byStatus?.locked?.fill);
	});
});

describe("renderToSVG", () => {
	it("produces a standalone SVG with one shape per node and edge", () => {
		const svg = renderToSVG(diamondMap(), stateWith(["n1"]));

		expect(svg.startsWith("<svg xmlns=")).toBe(true);
		expect(svg.match(/<circle /g)).toHaveLength(4);
		expect(svg.match(/<path /g)).toHaveLength(4);
	});

	it("tags shapes with their ids and statuses so a host can hit-test", () => {
		const svg = renderToSVG(diamondMap(), stateWith(["n1"]));

		expect(svg).toContain('data-spire-node="n1"');
		expect(svg).toContain('data-spire-status="completed"');
		expect(svg).toContain('data-spire-edge="e1"');
	});

	it("scales the rendered size without changing the viewBox", () => {
		const plain = renderToSVG(diamondMap(), stateWith([]));
		const doubled = renderToSVG(diamondMap(), stateWith([]), { scale: 2 });

		const viewBox = /viewBox="([^"]+)"/.exec(plain)?.[1];
		expect(doubled).toContain(`viewBox="${viewBox}"`);
		expect(Number(/ width="([\d.]+)"/.exec(doubled)?.[1])).toBe(
			Number(/ width="([\d.]+)"/.exec(plain)?.[1]) * 2,
		);
	});

	it("marks the image decorative unless given a title", () => {
		expect(renderToSVG(diamondMap(), stateWith([]))).toContain('role="presentation"');

		const titled = renderToSVG(diamondMap(), stateWith([]), { title: "Q3 map" });
		expect(titled).toContain('role="img"');
		expect(titled).toContain("<title>Q3 map</title>");
	});

	it("escapes text that would otherwise break the markup", () => {
		const svg = renderToSVG(diamondMap(), stateWith([]), { title: '<script>&"' });

		expect(svg).toContain("&lt;script&gt;&amp;");
		expect(svg).not.toContain("<script>");
	});

	it("is deterministic for the same inputs", () => {
		const a = renderToSVG(diamondMap(), stateWith(["n1"]));
		const b = renderToSVG(diamondMap(), stateWith(["n1"]));

		expect(a).toBe(b);
	});

	it("matches the recorded output", () => {
		expect(renderToSVG(diamondMap(), stateWith(["n1", "n2"]))).toMatchSnapshot();
	});
});
