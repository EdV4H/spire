import type { MapDocument, NodeId } from "../types.js";
import { buildIndex } from "./index-map.js";

export interface PathsOptions {
	/**
	 * Stop after this many paths. A wide map has exponentially many routes, and
	 * an unbounded enumeration is a denial of service on a host that calls this
	 * from a request handler. The default is generous but finite.
	 */
	limit?: number;
}

export interface PathsResult {
	paths: NodeId[][];
	/** True when enumeration stopped at `limit` and more paths exist. */
	truncated: boolean;
}

/**
 * Every route from a start node (row 0) to a terminal node (last row).
 *
 * Edges run strictly downward in a valid map, so a depth-first walk terminates
 * without a visited set. The guard here is the path limit, not cycle
 * detection — a document with a cycle fails validation before it gets here.
 */
export function paths(map: MapDocument, options: PathsOptions = {}): PathsResult {
	const limit = options.limit ?? 10_000;
	const index = buildIndex(map);
	const terminals = new Set(index.terminalNodes);

	const found: NodeId[][] = [];
	let truncated = false;

	const walk = (id: NodeId, trail: NodeId[]): void => {
		if (truncated) return;
		if (trail.includes(id)) return; // defensive: only reachable on an invalid map

		const next = [...trail, id];
		if (terminals.has(id)) {
			if (found.length >= limit) {
				truncated = true;
				return;
			}
			found.push(next);
			return;
		}

		for (const child of index.outgoing.get(id) ?? []) {
			walk(child, next);
			if (truncated) return;
		}
	};

	for (const start of index.startNodes) {
		walk(start, []);
		if (truncated) break;
	}

	return { paths: found, truncated };
}
