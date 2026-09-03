/**
 * Print generated maps as ASCII art.
 *
 * This exists to answer a question the test suite cannot: *do the maps look
 * right?* The design document leaves the practical range of `walks` open
 * (§8, open question 2) — too few and the map is a corridor, too many and every
 * row is fully connected and the branching stops meaning anything. Flipping
 * through twenty seeds at a given density settles that in about a minute.
 *
 *   pnpm --filter @edv4h/spire-examples start -- --walks 4 --count 5
 */

import { buildIndex, type MapDocument } from "@edv4h/spire-core";
import { type GenSpecInput, generate } from "@edv4h/spire-gen";

interface Args {
	seed: number;
	count: number;
	cols: number;
	rows: number;
	walks: number;
	minStarts: number;
}

function parseArgs(argv: readonly string[]): Args {
	const defaults: Args = { seed: 42, count: 1, cols: 5, rows: 12, walks: 4, minStarts: 2 };
	const args = { ...defaults };

	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i]?.replace(/^--/, "");
		const value = Number(argv[i + 1]);
		if (flag === undefined || Number.isNaN(value)) continue;
		if (flag in args) args[flag as keyof Args] = value;
	}
	return args;
}

/**
 * Render one map.
 *
 * Node rows show a type initial per occupied column; the row between two node
 * rows shows the edges, `|` for a straight step and `/` or `\` for a diagonal.
 * That is enough to read branching density at a glance, which is the whole
 * point.
 */
function toAscii(map: MapDocument): string {
	const index = buildIndex(map);
	const width = map.grid.cols;
	const lines: string[] = [];

	const initialOf = (type: string) => type.charAt(0).toUpperCase();

	for (let row = map.grid.rows - 1; row >= 0; row--) {
		const cells: string[] = Array.from({ length: width }, () => " ");
		for (const nodeId of index.byRow.get(row) ?? []) {
			const node = index.nodesById.get(nodeId);
			if (node !== undefined) cells[node.position.col] = initialOf(node.type);
		}
		lines.push(`${String(row).padStart(2)} ${cells.join("   ")}`);

		if (row === 0) break;

		// Edges from row-1 up into row.
		const connectors: string[] = Array.from({ length: width * 4 - 3 }, () => " ");
		for (const edge of map.edges) {
			const from = index.nodesById.get(edge.from);
			const to = index.nodesById.get(edge.to);
			if (from === undefined || to === undefined) continue;
			if (from.position.row !== row - 1 || to.position.row !== row) continue;

			// Rows print high-to-low, so an edge to a column further right leaves
			// its lower node going up-and-right: "/" on screen, not "\".
			const delta = to.position.col - from.position.col;
			const slot = from.position.col * 4 + (delta === 0 ? 0 : delta > 0 ? 2 : -2);
			if (slot >= 0 && slot < connectors.length) {
				connectors[slot] = delta === 0 ? "|" : delta > 0 ? "/" : "\\";
			}
		}
		lines.push(`   ${connectors.join("")}`);
	}

	return lines.join("\n");
}

function legend(map: MapDocument): string {
	const counts = new Map<string, number>();
	for (const node of map.nodes) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
	return [...counts]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([type, count]) => `${type.charAt(0).toUpperCase()}=${type}(${count})`)
		.join("  ");
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	for (let i = 0; i < args.count; i++) {
		const seed = args.seed + i;
		const spec: GenSpecInput = {
			seed,
			skeleton: {
				grid: { cols: args.cols, rows: args.rows },
				walks: args.walks,
				minStarts: args.minStarts,
			},
			types: {
				distribution: { step: 0.6, gate: 0.25, bonus: 0.15 },
				constraints: [
					{ rule: "fixedRow", row: -1, type: "final" },
					{ rule: "minRow", type: "gate", row: 2 },
					{ rule: "noAdjacentSame", types: ["gate", "bonus"] },
					{ rule: "branchDistinct", exempt: ["final"] },
				],
			},
		};

		const result = await generate(spec);
		if (!result.ok) {
			process.stdout.write(`seed ${seed}: ${result.error.code} — ${result.error.message}\n\n`);
			continue;
		}

		const map = result.value;
		process.stdout.write(
			[
				`seed ${seed}  ${map.grid.cols}x${map.grid.rows}  walks=${args.walks}  nodes=${map.nodes.length}  edges=${map.edges.length}`,
				toAscii(map),
				legend(map),
				"",
				"",
			].join("\n"),
		);
	}
}

await main();
