import { createSpire, type MapDocument, SMF_VERSION, type StateDocument } from "@edv4h/spire-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RenderBackend } from "./backend.js";
import { createRenderPlugin } from "./plugin.js";
import type { EdgeRenderer, LayerRenderer, NodeRenderer } from "./registries.js";
import { getRenderRegistries } from "./registries.js";
import { SpireMap } from "./spire-map.js";
import { renderToSVG } from "./svg.js";
import { defaultTheme, type SpireTheme } from "./theme.js";

/**
 * Custom renderers exist so that node art survives the trip to a share image.
 * The test that matters is therefore not "does the shape appear" but "do both
 * backends draw the same thing" — so almost everything here asserts against
 * React and `renderToSVG` together.
 */

function map(): MapDocument {
	return {
		smfVersion: SMF_VERSION,
		id: "map_test",
		seed: 42,
		grid: { cols: 3, rows: 2 },
		nodeTypes: [{ id: "step" }, { id: "boss" }],
		nodes: [
			{ id: "n1", type: "step", position: { col: 1, row: 0 } },
			{ id: "n2", type: "boss", position: { col: 1, row: 1 }, data: { title: "山場" } },
		],
		edges: [{ id: "e1", from: "n1", to: "n2" }],
	};
}

const state: StateDocument = { smfVersion: SMF_VERSION, mapId: "map_test", completed: {} };

const crown: NodeRenderer = {
	id: "boss-crown",
	draw: (node) => [
		{ shape: "rect", x: -14, y: -14, width: 28, height: 28, rx: 6, fill: node.fill },
		{ shape: "text", text: String(node.data?.title ?? ""), anchor: "middle", fontSize: 10 },
	],
};

const arrow: EdgeRenderer = {
	id: "arrow",
	draw: (edge) => [
		{ shape: "path", d: edge.path, fill: "none", stroke: edge.stroke },
		{
			shape: "polygon",
			points: [
				[0, 0],
				[6, 3],
				[0, 6],
			],
			fill: edge.stroke,
		},
	],
};

const grid: LayerRenderer = {
	id: "grid",
	place: "background",
	draw: (ctx) => [{ shape: "line", x1: 0, y1: 0, x2: ctx.scene.size.width, y2: 0, stroke: "#eee" }],
};

async function spireWith(...renderers: readonly (NodeRenderer | EdgeRenderer | LayerRenderer)[]) {
	const result = await createSpire({
		plugins: [
			createRenderPlugin({
				nodeRenderers: renderers.filter((r): r is NodeRenderer => r.id === "boss-crown"),
				edgeRenderers: renderers.filter((r): r is EdgeRenderer => r.id === "arrow"),
				layers: renderers.filter((r): r is LayerRenderer => r.id === "grid"),
			}),
		],
	});
	if (!result.ok) throw new Error("plugin setup failed");
	return result.value;
}

/** A theme that points the `boss` type and every edge at the custom renderers. */
const themed: SpireTheme = {
	...defaultTheme,
	node: {
		...defaultTheme.node,
		boss: { ...defaultTheme.node.default, renderer: "boss-crown" },
	},
	edge: { ...defaultTheme.edge, renderer: "arrow" },
};

describe("custom renderers", () => {
	it("draws a registered node renderer in both backends", async () => {
		const spire = await spireWith(crown);

		const html = renderToStaticMarkup(
			<SpireMap map={map()} state={state} theme={themed} spire={spire} />,
		);
		const svg = renderToSVG(map(), state, { theme: themed, spire });

		for (const markup of [html, svg]) {
			expect(markup).toContain("<rect");
			expect(markup).toContain("山場");
			// The `step` node keeps the built-in circle.
			expect(markup.match(/<circle/g)).toHaveLength(1);
		}
	});

	it("draws a registered edge renderer in both backends", async () => {
		const spire = await spireWith(arrow);
		const html = renderToStaticMarkup(
			<SpireMap map={map()} state={state} theme={themed} spire={spire} />,
		);
		const svg = renderToSVG(map(), state, { theme: themed, spire });

		expect(html).toContain("<polygon");
		expect(svg).toContain("<polygon");
	});

	it("draws layers in both backends", async () => {
		const spire = await spireWith(grid);
		const plain: SpireTheme = defaultTheme;

		const html = renderToStaticMarkup(
			<SpireMap map={map()} state={state} theme={plain} spire={spire} />,
		);
		const svg = renderToSVG(map(), state, { theme: plain, spire });

		expect(html).toContain("<line");
		expect(svg).toContain("<line");
	});

	it("falls back to the built-in look when the id is not registered", async () => {
		// A theme naming a renderer the host forgot to load should look plain,
		// not blank the map.
		const spire = await spireWith();
		const svg = renderToSVG(map(), state, { theme: themed, spire });

		expect(svg.match(/<circle/g)).toHaveLength(2);
		expect(svg).not.toContain("<rect");
	});

	it("falls back when no spire is passed at all", () => {
		const svg = renderToSVG(map(), state, { theme: themed });
		expect(svg.match(/<circle/g)).toHaveLength(2);
	});

	it("keeps node and status attributes on the wrapper, whatever is drawn", async () => {
		const spire = await spireWith(crown);
		const svg = renderToSVG(map(), state, { theme: themed, spire });

		expect(svg).toContain('data-spire-node="n2"');
		expect(svg).toContain('data-spire-status="locked"');
	});

	it("registers renderers through the service registry", async () => {
		const spire = await spireWith(crown, arrow, grid);
		const registries = getRenderRegistries(spire);

		expect(registries?.nodeRenderers.ids()).toEqual(["boss-crown"]);
		expect(registries?.edgeRenderers.ids()).toEqual(["arrow"]);
		expect(registries?.layers.ids()).toEqual(["grid"]);
	});

	it("is absent when the render plugin is not loaded", async () => {
		const result = await createSpire({ plugins: [] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(getRenderRegistries(result.value)).toBeUndefined();
	});
});

describe("layer ordering", () => {
	it("draws background under the edges and overlay over the nodes", async () => {
		const under: LayerRenderer = {
			id: "grid",
			place: "background",
			draw: () => [{ shape: "line", x1: 0, y1: 0, x2: 1, y2: 1, stroke: "#under" }],
		};
		const over: LayerRenderer = {
			id: "badges",
			place: "overlay",
			draw: () => [{ shape: "line", x1: 0, y1: 0, x2: 2, y2: 2, stroke: "#over" }],
		};
		const result = await createSpire({
			plugins: [createRenderPlugin({ layers: [over, under] })],
		});
		if (!result.ok) throw new Error("plugin setup failed");

		const svg = renderToSVG(map(), state, { spire: result.value });

		expect(svg.indexOf("#under")).toBeLessThan(svg.indexOf("data-spire-edge"));
		expect(svg.indexOf("#over")).toBeGreaterThan(svg.indexOf("data-spire-node"));
	});

	it("orders by `order`, then by registration", async () => {
		const layer = (id: string, order?: number): LayerRenderer => ({
			id,
			place: "background",
			...(order === undefined ? {} : { order }),
			draw: () => [{ shape: "line", x1: 0, y1: 0, x2: 1, y2: 1, stroke: `#${id}` }],
		});
		const result = await createSpire({
			plugins: [
				createRenderPlugin({ layers: [layer("third", 5), layer("first"), layer("second")] }),
			],
		});
		if (!result.ok) throw new Error("plugin setup failed");

		const svg = renderToSVG(map(), state, { spire: result.value });
		expect(svg.indexOf("#first")).toBeLessThan(svg.indexOf("#second"));
		expect(svg.indexOf("#second")).toBeLessThan(svg.indexOf("#third"));
	});
});

describe("backends", () => {
	/** A backend that draws nothing but says it ran. */
	const marker: RenderBackend = {
		id: "marker",
		keyboardAccessible: false,
		Component: ({ scene }) => <div data-backend="marker">{scene.nodes.length}</div>,
	};

	async function spireWithBackend() {
		const result = await createSpire({ plugins: [createRenderPlugin({ backends: [marker] })] });
		if (!result.ok) throw new Error("plugin setup failed");
		return result.value;
	}

	it("uses SVG by default", () => {
		const html = renderToStaticMarkup(<SpireMap map={map()} state={state} />);
		expect(html).toContain('data-spire-backend="svg"');
	});

	it("uses a registered backend when named", async () => {
		const spire = await spireWithBackend();
		const html = renderToStaticMarkup(
			<SpireMap map={map()} state={state} spire={spire} backend="marker" />,
		);

		expect(html).toContain('data-backend="marker"');
		expect(html).not.toContain("<svg");
	});

	it("hands the backend the same scene the SVG one draws", async () => {
		const spire = await spireWithBackend();
		const html = renderToStaticMarkup(
			<SpireMap map={map()} state={state} spire={spire} backend="marker" />,
		);

		// The marker prints the node count: both backends see one scene.
		expect(html).toContain(">2<");
	});

	it("falls back to SVG for an id nobody registered", async () => {
		const spire = await spireWithBackend();
		const html = renderToStaticMarkup(
			<SpireMap map={map()} state={state} spire={spire} backend="nope" />,
		);

		expect(html).toContain('data-spire-backend="svg"');
	});

	it("falls back to SVG when a backend is named without a spire", () => {
		const html = renderToStaticMarkup(<SpireMap map={map()} state={state} backend="marker" />);
		expect(html).toContain('data-spire-backend="svg"');
	});

	it("records whether a backend can be operated from the keyboard", async () => {
		const spire = await spireWithBackend();
		const registries = getRenderRegistries(spire);

		expect(registries?.backends.get("marker")?.keyboardAccessible).toBe(false);
	});
});
