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
	/**
	 * Rows every route must funnel through a single node on.
	 *
	 * Row 0 and the terminal row are not allowed here: `minStarts`/`maxStarts`
	 * and `maxEnds` already own those, and two knobs for one thing is how a spec
	 * ends up contradicting itself.
	 */
	chokeRows: z.array(z.int().nonnegative()).default([]),
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

			const terminalRow = rows - 1;
			const outOfRange = params.chokeRows.filter((row) => row < 1 || row >= terminalRow);
			if (outOfRange.length > 0) {
				return err({
					code: "impossible" as const,
					message: `chokeRows must name rows between 1 and ${terminalRow - 1}; got ${outOfRange.join(", ")}. Row 0 is controlled by minStarts/maxStarts and row ${terminalRow} by maxEnds.`,
					meta: { chokeRows: params.chokeRows, terminalRow },
				});
			}

			// A choke at row R is at most R columns from row 0, so it leaves an
			// entry window of at most 2R+1 columns. Checked here rather than left
			// to the draw, so a spec cannot fail for some seeds and not others.
			const firstChoke = [...params.chokeRows].sort((a, b) => a - b)[0];
			if (firstChoke !== undefined) {
				const room = Math.min(cols, 2 * firstChoke + 1);
				if (params.minStarts > room) {
					return err({
						code: "impossible" as const,
						message: `minStarts ${params.minStarts} cannot be reached from a choke at row ${firstChoke}, which leaves room for at most ${room} entry columns.`,
						meta: { minStarts: params.minStarts, chokeRow: firstChoke, room },
					});
				}
			}

			// `null` is the explicit "no cap"; omitting it pins the count to the
			// floor, which is what asking for a floor almost always means.
			const maxStarts =
				params.maxStarts === null ? undefined : (params.maxStarts ?? params.minStarts);

			return ok(
				walk(params.grid, params.walks, params.minStarts, rng, {
					chokeRows: params.chokeRows,
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
	chokeRows: readonly number[];
}

/**
 * A row, and the columns a walk may occupy on it.
 *
 * The terminal cap and every choke row are the same thing at different widths,
 * so they are one list. The window at any other row is the intersection of what
 * each gate allows once widened by the rows between — and because that window is
 * shared by every walk, their left-to-right order is preserved and the funnel
 * still cannot introduce a crossing. An intersection of intervals whose ends
 * each move by at most one column per row also moves by at most one, so the
 * argument survives having more than one gate.
 */
interface Gate {
	row: number;
	lo: number;
	hi: number;
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

	const gates = chooseGates(cols, walks, terminalRow, minStarts, funnel, rng);
	// Entry columns come from the window at row 0, not from the whole grid: a
	// start the gates cannot be reached from produces a walk that never lands
	// where it was supposed to, which is how `maxEnds` used to be exceeded.
	const startColumns = chooseStarts(
		allowedWindow(gates, 0, cols),
		walks,
		minStarts,
		funnel.maxStarts,
		rng,
	);

	for (const startCol of startColumns) {
		let col = startCol;
		occupied.add(key(col, 0));

		for (let row = 0; row < terminalRow; row++) {
			const steps = stepsByRow[row] ?? [];
			const window = allowedWindow(gates, row + 1, cols);

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
 * Where each gate sits, chosen in row order so every gate is reachable from the
 * one before it. Choosing them independently would let a spec ask for two
 * chokes a single row apart at opposite edges — unreachable, and only
 * discoverable once a walk was already stuck.
 */
function chooseGates(
	cols: number,
	walks: number,
	terminalRow: number,
	minStarts: number,
	funnel: Funnel,
	rng: Rng,
): Gate[] {
	const gates: Gate[] = [];
	let previous: Gate | undefined;

	for (const row of [...new Set(funnel.chokeRows)].sort((a, b) => a - b)) {
		const reach = reachFrom(previous, row, cols);
		// A choke near row 0 squeezes the entry window, so prefer columns that
		// still leave room for the entry points the spec asked for. `impossible`
		// has already rejected the cases where no column can.
		const roomy = columnsIn(reach).filter(
			(col) => width(allowedWindow([{ row, lo: col, hi: col }], 0, cols)) >= minStarts,
		);
		const options = roomy.length > 0 ? roomy : columnsIn(reach);
		const col = options[rng.int(options.length)] ?? reach.lo;

		previous = { row, lo: col, hi: col };
		gates.push(previous);
	}

	if (funnel.maxEnds !== undefined) {
		const block = Math.max(1, Math.min(funnel.maxEnds, cols, walks));

		if (previous === undefined) {
			// The single-gate draw, unchanged, so a spec with no choke rows still
			// produces the same map from the same seed.
			const lo = rng.int(cols - block + 1);
			gates.push({ row: terminalRow, lo, hi: lo + block - 1 });
		} else {
			const reach = reachFrom(previous, terminalRow, cols);
			const last = Math.max(reach.lo, Math.min(reach.hi - block + 1, cols - block));
			const lo = reach.lo + rng.int(Math.max(1, last - reach.lo + 1));
			gates.push({ row: terminalRow, lo, hi: Math.min(cols - 1, lo + block - 1) });
		}
	}

	return gates;
}

/** Columns reachable at `row` from the gate before it, a column per row of slack. */
function reachFrom(
	previous: Gate | undefined,
	row: number,
	cols: number,
): { lo: number; hi: number } {
	if (previous === undefined) return { lo: 0, hi: cols - 1 };
	const slack = row - previous.row;
	return {
		lo: Math.max(0, previous.lo - slack),
		hi: Math.min(cols - 1, previous.hi + slack),
	};
}

/**
 * Columns a walk may occupy at `row`: what every gate allows, intersected.
 *
 * A step moves at most one column, so a walk at row `r` can still make a gate
 * `n` rows away if it is within `n` columns of it. Applying that as a hard
 * filter funnels the walks without any extra bookkeeping.
 */
function allowedWindow(
	gates: readonly Gate[],
	row: number,
	cols: number,
): { lo: number; hi: number } {
	let lo = 0;
	let hi = cols - 1;
	for (const gate of gates) {
		const slack = Math.abs(gate.row - row);
		lo = Math.max(lo, gate.lo - slack);
		hi = Math.min(hi, gate.hi + slack);
	}
	return { lo, hi };
}

function width(span: { lo: number; hi: number }): number {
	return span.hi - span.lo + 1;
}

function columnsIn(span: { lo: number; hi: number }): number[] {
	return Array.from({ length: width(span) }, (_, i) => span.lo + i);
}

/**
 * Entry columns for the walks, drawn from the window row 0 allows.
 *
 * `minStarts` distinct columns are forced so a map cannot degenerate into a
 * single entry point by accident; `maxStarts` caps it so a map can be made to
 * have one on purpose. Walks beyond the distinct set reuse one of the columns
 * already chosen — not a fresh random column, which would quietly break the cap.
 */
function chooseStarts(
	entry: { lo: number; hi: number },
	walks: number,
	minStarts: number,
	maxStarts: number | undefined,
	rng: Rng,
): number[] {
	const available = columnsIn(entry);

	if (maxStarts === undefined) {
		// Uncapped: walks past the floor pick freely, which is how a map ends up
		// with more entry points than the minimum asked for.
		const distinct = rng.shuffle(available).slice(0, Math.min(minStarts, available.length));
		const rest = Array.from(
			{ length: Math.max(0, walks - distinct.length) },
			() => available[rng.int(available.length)] ?? entry.lo,
		);
		return [...distinct, ...rest];
	}

	const ceiling = Math.min(maxStarts, available.length, walks);
	const floor = Math.min(minStarts, ceiling);
	const distinctCount = floor + rng.int(ceiling - floor + 1);

	const chosen = rng.shuffle(available).slice(0, distinctCount);
	// Extra walks reuse a lane that is already open — drawing a fresh column
	// here is exactly what would break the cap.
	const rest = Array.from(
		{ length: Math.max(0, walks - chosen.length) },
		() => chosen[rng.int(chosen.length)] ?? entry.lo,
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

function key(col: number, row: number): string {
	return `${col},${row}`;
}

function nodeId(col: number, row: number): string {
	return `n${row}_${col}`;
}
