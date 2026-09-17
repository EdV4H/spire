import { describe, expect, it } from "vitest";
import { generate } from "../generate.js";

/** Scratch probe: does maxEnds hold when a start cannot reach the landing? */
describe("probe", () => {
	it("short map, several starts, maxEnds 1", async () => {
		const counts: number[] = [];
		for (let seed = 0; seed < 40; seed++) {
			const result = await generate({
				seed,
				skeleton: {
					grid: { cols: 5, rows: 2 },
					walks: 5,
					minStarts: 4,
					maxStarts: 4,
					maxEnds: 1,
				},
				types: { distribution: { step: 1 }, constraints: [] },
			});
			if (!result.ok) continue;
			const terminal = result.value.grid.rows - 1;
			counts.push(result.value.nodes.filter((n) => n.position.row === terminal).length);
		}
		expect({ seeds: counts.length, terminalCounts: [...new Set(counts)].sort() }).toEqual({
			seeds: 40,
			terminalCounts: [1],
		});
	});
});
