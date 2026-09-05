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
	// `undefined` pins the count to `minStarts`; `null` means no cap.
	maxStarts: z.int().positive().nullish(),
	// `null` and `undefined` both mean no cap.
	maxEnds: z.int().positive().nullish(),
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
			if (typeof params.maxStarts === "number" && params.maxStarts < params.minStarts) {
				return err({
					code: "impossible" as const,
					message: `maxStarts ${params.maxStarts} is below minStarts ${params.minStarts}.`,
					meta: { minStarts: params.minStarts, maxStarts: params.maxStarts },
				});
			}

			// `null` is the explicit "no cap"; omitting it pins the count to the
			// floor, which is what asking for a floor almost always means.
			const maxStarts =
				params.maxStarts === null ? undefined : (params.maxStarts ?? params.minStarts);

			return ok(
				walk(params.grid, params.walks, params.minStarts, rng, {
					...(maxStarts === undefined ? {} : { maxStarts }),
					...(params.maxEnds == null ? {} : { maxEnds: params.maxEnds }),
				}),
			);
		},
	};
}

interface Funnel {
	maxStarts?: number;
	maxEnds?: number;
}

function walk(
	grid: { cols: number; rows: number },
	walks: number,
	minStarts: number,
	rng: Rng,
	funnel: Funnel,
): Skeleton {
	const { cols, rows } = grid;
	const terminalRow = rows - 1;

	// Steps already taken between row r and r+1, used for crossing rejection.
	const stepsByRow: Step[][] = Array.from({ length: rows - 1 }, () => []);
	const occupied = new Set<string>();
	const edgeKeys = new Set<string>();
	const edges: SkeletonEdge[] = [];

	const landing = chooseLanding(cols, walks, funnel.maxEnds, rng);
	const startColumns = chooseStarts(cols, walks, minStarts, funnel.maxStarts, rng);

	for (const startCol of startColumns) {
		let col = startCol;
		occupied.add(key(col, 0));

		for (let row = 0; row < terminalRow; row++) {
			const steps = stepsByRow[row] ?? [];
			const window = allowedWindow(landing, terminalRow, row + 1, cols);

			const inWindow = candidateColumns(col, cols).filter(
				(next) => next >= window.lo && next <= window.hi,
			);
			const candidates = inWindow.filter((next) => !crosses(steps, col, next));

			// Both filters are always satisfiable together: the window narrows by
			// at most one column per row, so a walk is never forced to move in a
			// direction that would invert its order against another walk. The
			// fallbacks below are defensive only.
			const nextCol = rng.pick(candidates) ?? inWindow[0] ?? col;

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
 * The contiguous block of columns the walks are allowed to finish in.
 *
 * A single block rather than scattered targets, because the funnel is enforced
 * as one widening interval that every walk shares — which is what makes it
 * impossible for the funnel to force two walks to swap sides and cross. With
 * `maxEnds: 1` the block is one column and every route ends on the same node.
 */
function chooseLanding(
	cols: number,
	walks: number,
	maxEnds: number | undefined,
	rng: Rng,
): { lo: number; hi: number } {
	if (maxEnds === undefined) return { lo: 0, hi: cols - 1 };

	const width = Math.max(1, Math.min(maxEnds, cols, walks));
	const lo = rng.int(cols - width + 1);
	return { lo, hi: lo + width - 1 };
}

/**
 * Columns reachable at `row` while still being able to land inside the block.
 *
 * A step moves at most one column, so a walk at row `r` can still reach the
 * block if it is within `terminalRow - r` columns of it. Applying that as a
 * hard filter funnels the walks in without any extra bookkeeping — and because
 * the interval is the same for every walk, it preserves their left-to-right
 * order.
 */
function allowedWindow(
	landing: { lo: number; hi: number },
	terminalRow: number,
	row: number,
	cols: number,
): { lo: number; hi: number } {
	const slack = terminalRow - row;
	return {
		lo: Math.max(0, landing.lo - slack),
		hi: Math.min(cols - 1, landing.hi + slack),
	};
}

/**
 * Entry columns for the walks.
 *
 * `minStarts` distinct columns are forced so a map cannot degenerate into a
 * single entry point by accident; `maxStarts` caps it so a map can be made to
 * have one on purpose. Walks beyond the distinct set reuse one of the columns
 * already chosen — not a fresh random column, which would quietly break the
 * cap.
 */
function chooseStarts(
	cols: number,
	walks: number,
	minStarts: number,
	maxStarts: number | undefined,
	rng: Rng,
): number[] {
	if (maxStarts === undefined) {
		// Uncapped: walks past the floor pick freely, which is how a map ends up
		// with more entry points than the minimum asked for. Left untouched so a
		// spec without the cap keeps producing the same map from the same seed.
		const distinct = rng.shuffle(range(cols)).slice(0, Math.min(minStarts, cols));
		const rest = Array.from({ length: Math.max(0, walks - distinct.length) }, () => rng.int(cols));
		return [...distinct, ...rest];
	}

	const ceiling = Math.min(maxStarts, cols, walks);
	const floor = Math.min(minStarts, ceiling);
	const distinctCount = floor + rng.int(ceiling - floor + 1);

	const chosen = rng.shuffle(range(cols)).slice(0, distinctCount);
	// Extra walks reuse a lane that is already open — drawing a fresh column
	// here is exactly what would break the cap.
	const rest = Array.from(
		{ length: Math.max(0, walks - chosen.length) },
		() => chosen[rng.int(chosen.length)] ?? 0,
	);
	return [...chosen, ...rest];
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
