// @vitest-environment jsdom

import { type MapDocument, SMF_VERSION, type StateDocument } from "@edv4h/spire-core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpireMap } from "./spire-map.js";

/**
 * Focus behaviour, pinned because it shipped wrong once.
 *
 * `focusNodeId` scrolls the map's own scroll container and nothing above it. The
 * first implementation used `element.scrollIntoView`, which walks up and scrolls
 * every scrollable ancestor including the document — so focusing a node inside
 * an embedded map moved the host's page out from under the reader.
 */

function diamondMap(): MapDocument {
	return {
		smfVersion: SMF_VERSION,
		id: "map_test",
		seed: 42,
		grid: { cols: 3, rows: 3 },
		nodeTypes: [{ id: "step" }],
		nodes: [
			{ id: "n1", type: "step", position: { col: 1, row: 0 } },
			{ id: "n2", type: "step", position: { col: 0, row: 1 } },
			{ id: "n3", type: "step", position: { col: 2, row: 1 } },
			{ id: "n4", type: "step", position: { col: 1, row: 2 } },
		],
		edges: [
			{ id: "e1", from: "n1", to: "n2" },
			{ id: "e2", from: "n1", to: "n3" },
			{ id: "e3", from: "n2", to: "n4" },
			{ id: "e4", from: "n3", to: "n4" },
		],
	};
}

const state: StateDocument = { smfVersion: SMF_VERSION, mapId: "map_test", completed: {} };

interface Harness {
	scroller: HTMLDivElement;
	scrollTo: ReturnType<typeof vi.fn>;
	scrollIntoView: ReturnType<typeof vi.fn>;
	render: (focusNodeId?: string) => void;
	cleanup: () => void;
}

function mount(): Harness {
	const scroller = document.createElement("div");
	// jsdom computes styles but reports zero geometry, so the scrollability
	// check needs both an overflow style and a scrollHeight to look at.
	scroller.style.overflow = "auto";
	Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
	Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });

	const host = document.createElement("div");
	scroller.appendChild(host);
	document.body.appendChild(scroller);

	const scrollTo = vi.fn();
	scroller.scrollTo = scrollTo as unknown as Element["scrollTo"];

	const scrollIntoView = vi.fn();
	Element.prototype.scrollIntoView = scrollIntoView as unknown as Element["scrollIntoView"];

	const root = createRoot(host);
	return {
		scroller,
		scrollTo,
		scrollIntoView,
		render(focusNodeId?: string) {
			act(() => {
				root.render(
					<SpireMap
						map={diamondMap()}
						state={state}
						{...(focusNodeId === undefined ? {} : { focusNodeId })}
					/>,
				);
			});
		},
		cleanup() {
			act(() => root.unmount());
			scroller.remove();
		},
	};
}

let harness: Harness;

beforeEach(() => {
	harness = mount();
});

afterEach(() => {
	harness.cleanup();
	vi.restoreAllMocks();
});

describe("focusNodeId", () => {
	it("scrolls nothing when no node is focused", () => {
		harness.render();

		expect(harness.scrollTo).not.toHaveBeenCalled();
		expect(harness.scrollIntoView).not.toHaveBeenCalled();
	});

	it("scrolls the map's own container, not its ancestors", () => {
		harness.render("n4");

		expect(harness.scrollTo).toHaveBeenCalledTimes(1);
		// The regression: scrollIntoView would have moved the host page too.
		expect(harness.scrollIntoView).not.toHaveBeenCalled();
	});

	it("does not re-scroll when the focused node stays the same", () => {
		harness.render("n4");
		harness.render("n4");

		expect(harness.scrollTo).toHaveBeenCalledTimes(1);
	});

	it("scrolls again when the focused node changes", () => {
		harness.render("n4");
		harness.render("n2");

		expect(harness.scrollTo).toHaveBeenCalledTimes(2);
	});

	it("does nothing when the map is not inside a scroll container", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);

		act(() => {
			root.render(<SpireMap map={diamondMap()} state={state} focusNodeId="n4" />);
		});

		expect(harness.scrollIntoView).not.toHaveBeenCalled();

		act(() => root.unmount());
		host.remove();
	});

	it("ignores a node id the map does not have", () => {
		harness.render("nope");

		expect(harness.scrollTo).not.toHaveBeenCalled();
	});
});
