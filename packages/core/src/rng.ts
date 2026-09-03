/**
 * Seeded, deterministic pseudo-random number generation.
 *
 * Generation and layout jitter must both be reproducible from a seed, and the
 * SDK is environment-agnostic, so `Math.random` and `crypto` are never used.
 * The algorithm is mulberry32: 32-bit state, one multiply-xorshift round, good
 * enough distribution for map generation and trivially portable to other
 * languages (which matters because SMF is a cross-language contract).
 */
export interface Rng {
	/** Next float in [0, 1). */
	next(): number;
	/** Next integer in [0, maxExclusive). Returns 0 when `maxExclusive <= 0`. */
	int(maxExclusive: number): number;
	/** Uniform pick. Returns `undefined` only for an empty list. */
	pick<T>(items: readonly T[]): T | undefined;
	/**
	 * Weighted pick over `[item, weight]` pairs. Non-positive weights are
	 * skipped. Returns `undefined` when every weight is non-positive.
	 */
	weighted<T>(entries: readonly (readonly [T, number])[]): T | undefined;
	/** In-place-free shuffle (Fisher-Yates on a copy). */
	shuffle<T>(items: readonly T[]): T[];
	/**
	 * A new independent generator derived from this one's current state. Use it
	 * to give a sub-computation its own stream without coupling it to how many
	 * numbers the caller happened to draw afterwards.
	 */
	fork(): Rng;
}

/** Mix an arbitrary integer seed so that nearby seeds produce unrelated streams. */
function mixSeed(seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number): Rng {
	let state = mixSeed(seed);

	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	const rng: Rng = {
		next,
		int(maxExclusive) {
			if (maxExclusive <= 0) return 0;
			return Math.floor(next() * maxExclusive);
		},
		pick(items) {
			if (items.length === 0) return undefined;
			return items[rng.int(items.length)];
		},
		weighted(entries) {
			let total = 0;
			for (const [, weight] of entries) {
				if (weight > 0) total += weight;
			}
			if (total <= 0) return undefined;
			let roll = next() * total;
			for (const [item, weight] of entries) {
				if (weight <= 0) continue;
				roll -= weight;
				if (roll < 0) return item;
			}
			// Floating-point drift only; fall back to the last positive-weight entry.
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i];
				if (entry !== undefined && entry[1] > 0) return entry[0];
			}
			return undefined;
		},
		shuffle<T>(items: readonly T[]): T[] {
			const copy = [...items];
			for (let i = copy.length - 1; i > 0; i--) {
				const j = rng.int(i + 1);
				// Both indices are provably in range; the casts only silence
				// `noUncheckedIndexedAccess`, which cannot see that.
				const a = copy[i] as T;
				const b = copy[j] as T;
				copy[i] = b;
				copy[j] = a;
			}
			return copy;
		},
		fork() {
			return createRng(rng.int(0xffffffff));
		},
	};

	return rng;
}
