import { SMF_VERSION } from "../schema.js";
import type { MapDocument, StateDocument } from "../types.js";

/**
 * Hand-built maps for tests. Written literally rather than generated, so a test
 * failure points at a document you can read rather than at generator behaviour.
 */

export interface MapSpec {
	cols: number;
	rows: number;
	/** `id@col,row:type` */
	nodes: readonly string[];
	/** `from>to` */
	edges: readonly string[];
	types?: readonly string[];
}

export function buildMap(spec: MapSpec): MapDocument {
	const nodes = spec.nodes.map((entry) => {
		const [idPart, rest] = entry.split("@");
		const [position, type] = (rest ?? "").split(":");
		const [col, row] = (position ?? "").split(",");
		return {
			id: idPart ?? "",
			type: type ?? "step",
			position: { col: Number(col), row: Number(row) },
		};
	});

	const declaredTypes = spec.types ?? [...new Set(nodes.map((node) => node.type))];

	return {
		smfVersion: SMF_VERSION,
		id: "map_test",
		seed: 1,
		grid: { cols: spec.cols, rows: spec.rows },
		nodeTypes: declaredTypes.map((id) => ({ id })),
		nodes,
		edges: spec.edges.map((entry, i) => {
			const [from, to] = entry.split(">");
			return { id: `e${i + 1}`, from: from ?? "", to: to ?? "" };
		}),
	};
}

/**
 * A minimal well-formed map: one branch that immediately merges.
 *
 * ```
 * row 2        n4
 * row 1     n2    n3
 * row 0        n1
 * ```
 */
export function diamondMap(): MapDocument {
	return buildMap({
		cols: 3,
		rows: 3,
		nodes: ["n1@1,0:step", "n2@0,1:step", "n3@2,1:gate", "n4@1,2:final"],
		edges: ["n1>n2", "n1>n3", "n2>n4", "n3>n4"],
	});
}

/** Two independent lanes with no branching. */
export function twoLaneMap(): MapDocument {
	return buildMap({
		cols: 2,
		rows: 3,
		nodes: [
			"a0@0,0:step",
			"b0@1,0:step",
			"a1@0,1:step",
			"b1@1,1:step",
			"a2@0,2:final",
			"b2@1,2:final",
		],
		edges: ["a0>a1", "b0>b1", "a1>a2", "b1>b2"],
	});
}

export function stateOf(map: MapDocument, completed: Record<string, string>): StateDocument {
	const entries: Record<string, { at: string }> = {};
	for (const [nodeId, at] of Object.entries(completed)) entries[nodeId] = { at };
	return { smfVersion: map.smfVersion, mapId: map.id, completed: entries };
}
