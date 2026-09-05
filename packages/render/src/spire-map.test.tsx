import { type MapDocument, SMF_VERSION, type StateDocument } from "@edv4h/spire-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpireMap } from "./spire-map.js";
import { renderToSVG } from "./svg.js";
import { defaultTheme, type SpireTheme } from "./theme.js";

/**
 * The React renderer and `renderToSVG` must agree — that is the reason both are
 * built from one `Scene`, so it is worth a test that actually compares them.
 */

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

const state: StateDocument = {
	smfVersion: SMF_VERSION,
	mapId: "map_test",
	completed: { n1: { at: "2026-01-01T00:00:00Z" } },
};

describe("SpireMap", () => {
	it("draws a shape per node and per edge", () => {
		const html = renderToStaticMarkup(<SpireMap map={diamondMap()} state={state} />);

		expect(html.match(/<circle /g)).toHaveLength(4);
		expect(html.match(/<path /g)).toHaveLength(4);
	});

	it("tags nodes with their id and derived status", () => {
		const html = renderToStaticMarkup(<SpireMap map={diamondMap()} state={state} />);

		expect(html).toContain('data-spire-node="n1"');
		expect(html).toContain('data-spire-status="completed"');
		expect(html).toContain('data-spire-status="reachable"');
		expect(html).toContain('data-spire-status="locked"');
	});

	it("makes nodes operable only when a press handler is given", () => {
		const plain = renderToStaticMarkup(<SpireMap map={diamondMap()} state={state} />);
		expect(plain).not.toContain('role="button"');

		const interactive = renderToStaticMarkup(
			<SpireMap map={diamondMap()} state={state} onNodePress={() => {}} />,
		);
		expect(interactive).toContain('role="button"');
		expect(interactive).toContain('tabindex="0"');
	});

	it("uses a custom node renderer and falls back where it returns nothing", () => {
		const html = renderToStaticMarkup(
			<SpireMap
				map={diamondMap()}
				state={state}
				renderNode={(node) => (node.type === "gate" ? <rect width="20" height="20" /> : undefined)}
			/>,
		);

		expect(html.match(/<rect /g)).toHaveLength(1);
		expect(html.match(/<circle /g)).toHaveLength(3);
	});

	it("places the same geometry as renderToSVG", () => {
		const map = diamondMap();
		const theme: SpireTheme = { ...defaultTheme, jitter: { amount: 6 } };

		const html = renderToStaticMarkup(<SpireMap map={map} state={state} theme={theme} />);
		const svg = renderToSVG(map, state, { theme });

		const paths = (markup: string) => (markup.match(/d="([^"]+)"/g) ?? []).sort();
		expect(paths(html)).toEqual(paths(svg));

		const viewBox = (markup: string) => /viewBox="([^"]+)"/.exec(markup)?.[1];
		expect(viewBox(html)).toBe(viewBox(svg));
	});

	it("scales the drawn size without moving anything", () => {
		const map = diamondMap();
		const plain = renderToStaticMarkup(<SpireMap map={map} state={state} />);
		const zoomed = renderToStaticMarkup(<SpireMap map={map} state={state} scale={2} />);

		const attr = (markup: string, name: string) =>
			new RegExp(`${name}="([^"]+)"`).exec(markup)?.[1];

		expect(Number(attr(zoomed, "width"))).toBe(Number(attr(plain, "width")) * 2);
		expect(Number(attr(zoomed, "height"))).toBe(Number(attr(plain, "height")) * 2);

		// The scene is untouched: zoom is a drawing concern, so the geometry and
		// the viewBox must be identical to the unscaled render.
		expect(attr(zoomed, "viewBox")).toBe(attr(plain, "viewBox"));
		expect(zoomed.match(/d="([^"]+)"/g)).toEqual(plain.match(/d="([^"]+)"/g));
	});

	it("agrees with renderToSVG on what a scale means", () => {
		const map = diamondMap();
		const html = renderToStaticMarkup(<SpireMap map={map} state={state} scale={1.5} />);
		const svg = renderToSVG(map, state, { scale: 1.5 });

		const size = (markup: string) => [
			/width="([^"]+)"/.exec(markup)?.[1],
			/height="([^"]+)"/.exec(markup)?.[1],
		];
		expect(size(html)).toEqual(size(svg));
	});
});
