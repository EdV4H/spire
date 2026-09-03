import { err, ok, type Rng } from "@edv4h/spire-core";
import { z } from "zod";
import type { Skeleton, SkeletonAlgorithm, SkeletonEdge, SkeletonNode } from "../registries.js";

/**
 * The Slay-the-Spire-style skeleton: N independent walks from row 0 to the last
 * row, each stepping to one of the three nearest columns, sharing nodes where
 * they land on the same cell.
 *
 * Two properties come out of this for free, and they are why the algorithm was
 * chosen over a generic random DAG:
 *
 * - **Branch-and-merge structure.** Walks that converge create a merge; walks
 *   that diverge create a branch. The result reads as a route map rather than
 *   as an arbitrary graph.
 * - **No crossings, by construction.** A candidate step is rejected if it would
 *   cross an edge already drawn between the same pair of rows, so the skeleton
 *   satisfies the format's non-crossing invariant before validation ever runs
 *   — the generator never produces a map it would then have to throw away.
 *
 * With `walks < cols` some columns stay empty, which is deliberate: those cells
 * are the room `insertNode` needs to add a node later without forcing a
 * regeneration.
 */

export const STS_WALKS_ID = "sts-walks";

const paramsSchema = z.looseObject({
	grid: z.looseObject({ cols: z.int().positive(), rows: z.int().positive() }),
	walks: z.int().positive(),
	minStarts: z.int().positive(),
	connectivity: z.literal("closest3"),
});

interface Step {
	fromCol: number;
	toCol: number;
}

export function createStsWalksAlgorithm(): SkeletonAlgorithm {
	return {
		id: STS_WALKS_ID,
		paramsSchema,
		generate(rawParams, rng) {
			const parsed = paramsSchema.safeParse(rawParams);
			if (!parsed.success) {
				return err({
					code: "invalid_params" as const,
					message: `Invalid sts-walks parameters: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
				});
			}
			const params = parsed.data;
			const { cols, rows } = params.grid;

			if (rows < 2) {
				return err({
					code: "impossible" as const,
					message: "A map needs at least two rows: one to start on and one to finish on.",
					meta: { rows },
				});
			}
			if (params.minStarts > Math.min(cols, params.walks)) {
				return err({
					code: "impossible" as const,
					message: `minStarts ${params.minStarts} cannot exceed the number of walks (${params.walks}) or columns (${cols}).`,
					meta: { minStarts: params.minStarts, walks: params.walks, cols },
				});
			}

			return ok(walk(params.grid, params.walks, params.minStarts, rng));
		},
	};
}

function walk(
	grid: { cols: number; rows: number },
	walks: number,
	minStarts: number,
	rng: Rng,
): Skeleton {
	const { cols, rows } = grid;
	// Steps already taken between row r and r+1, used for crossing rejection.
	const stepsByRow: Step[][] = Array.from({ length: rows - 1 }, () => []);
	const occupied = new Set<string>();
	const edgeKeys = new Set<string>();
	const edges: SkeletonEdge[] = [];

	const startColumns = chooseStarts(cols, walks, minStarts, rng);

	for (const startCol of startColumns) {
		let col = startCol;
		occupied.add(key(col, 0));

		for (let row = 0; row < rows - 1; row++) {
			const steps = stepsByRow[row] ?? [];
			const candidates = candidateColumns(col, cols).filter((next) => !crosses(steps, col, next));

			// `col` itself is always a candidate and never crosses anything, so
			// this cannot be empty; the fallback is defensive only.
			const nextCol = rng.pick(candidates) ?? col;

			steps.push({ fromCol: col, toCol: nextCol });
			occupied.add(key(nextCol, row + 1));

			const edgeKey = `${key(col, row)}->${key(nextCol, row + 1)}`;
			if (!edgeKeys.has(edgeKey)) {
				edgeKeys.add(edgeKey);
				edges.push({
					id: `e_${col}_${row}_${nextCol}_${row + 1}`,
					from: nodeId(col, row),
					to: nodeId(nextCol, row + 1),
				});
			}

			col = nextCol;
		}
	}

	const nodes: SkeletonNode[] = [];
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			if (occupied.has(key(col, row))) {
				nodes.push({ id: nodeId(col, row), position: { col, row } });
			}
		}
	}

	return { grid, nodes, edges };
}

/**
 * Entry columns for the walks. The first `minStarts` walks are forced onto
 * distinct columns so a map cannot degenerate into a single entry point; the
 * rest are free to reuse one, which is what produces an early merge.
 */
function chooseStarts(cols: number, walks: number, minStarts: number, rng: Rng): number[] {
	const distinct = rng.shuffle(range(cols)).slice(0, Math.min(minStarts, cols));
	const rest = Array.from({ length: Math.max(0, walks - distinct.length) }, () => rng.int(cols));
	return [...distinct, ...rest];
}

function candidateColumns(col: number, cols: number): number[] {
	return [col - 1, col, col + 1].filter((c) => c >= 0 && c < cols);
}

/**
 * Whether stepping `from → to` would cross a step already taken between the
 * same two rows. Two steps cross exactly when their column order reverses.
 */
function crosses(steps: readonly Step[], from: number, to: number): boolean {
	return steps.some((step) => (step.fromCol - from) * (step.toCol - to) < 0);
}

function range(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i);
}

function key(col: number, row: number): string {
	return `${col},${row}`;
}

function nodeId(col: number, row: number): string {
	return `n${row}_${col}`;
}
