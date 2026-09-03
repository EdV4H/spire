/**
 * Deterministic identifier generation.
 *
 * Ids must be reproducible from a seed (§6 "決定性" in the design doc), so they
 * are sequential rather than random, and the map id is derived from the seed.
 */

export interface IdGen {
	/** Next id, e.g. `n1`, `n2`, … for prefix `n`. */
	next(): string;
	/** How many ids have been handed out. */
	count(): number;
}

export function createIdGen(prefix: string, start = 1): IdGen {
	let n = start;
	return {
		next() {
			const id = `${prefix}${n}`;
			n += 1;
			return id;
		},
		count() {
			return n - start;
		},
	};
}

/**
 * A stable, human-scannable map id derived from a seed: `map_9f3a`.
 *
 * Two different seeds can collide in 16 bits; that is acceptable because the id
 * identifies a document within a host's own storage, not globally. Hosts that
 * need global uniqueness assign their own id and pass it through `meta`.
 */
export function mapIdFromSeed(seed: number): string {
	let h = seed | 0;
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	const hex = ((h ^ (h >>> 16)) >>> 0).toString(16).padStart(8, "0");
	return `map_${hex.slice(0, 4)}`;
}
