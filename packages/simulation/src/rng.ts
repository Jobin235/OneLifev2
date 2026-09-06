/**
 * Deterministic randomness (spec §68, §125).
 *
 * Every roll in the game is drawn from a stream keyed by the life's root seed plus
 * a path describing *what* is being decided — `['ageup', 42, 'mortality']`, say.
 * Two consequences follow, and both matter:
 *
 *  - The same life replayed with the same choices produces the same story, so a
 *    bug report is reproducible from a seed and a choice list.
 *  - Adding a new roll somewhere in the pipeline does not shift the results of
 *    every roll after it, because streams are keyed rather than sequential.
 */

/** FNV-1a over a string, returning a 32-bit unsigned integer. */
const hashString = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

export type RngPart = string | number;

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick. Weights must be non-negative and not all zero. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Normal-ish deviate via the mean of four uniforms, in [-1, 1]. */
  jitter(): number;
}

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const makeRng = (seed: string, ...path: RngPart[]): Rng => {
  const next = mulberry32(hashString(path.length ? `${seed}|${path.join('|')}` : seed));

  const rng: Rng = {
    next,
    int: (min, max) => {
      if (max < min) throw new Error(`rng.int: max ${max} < min ${min}`);
      return min + Math.floor(next() * (max - min + 1));
    },
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick: empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: (items, weight) => {
      if (items.length === 0) throw new Error('rng.weighted: empty list');
      let total = 0;
      const weights = items.map((item) => {
        const w = Math.max(0, weight(item));
        total += w;
        return w;
      });
      if (total <= 0) return rng.pick(items);
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i]!;
        if (roll <= 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const a = out[i]!;
        out[i] = out[j]!;
        out[j] = a;
      }
      return out;
    },
    jitter: () => (next() + next() + next() + next()) / 2 - 1,
  };

  return rng;
};

/** Stable id generator, so replays produce identical ids as well as outcomes. */
export const makeId = (prefix: string, seed: string, ...path: RngPart[]): string =>
  `${prefix}_${hashString(`${seed}|${path.join('|')}`).toString(36)}`;
