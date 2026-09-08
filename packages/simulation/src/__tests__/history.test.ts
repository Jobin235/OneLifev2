import { describe, expect, it } from 'vitest';
import { pushHistory } from '../history.js';
import type { LifeState } from '@lineage/shared-types';

/**
 * History ids used to be a 32-bit FNV hash of the seed, the line, the age and
 * the length — unique only by luck. Four hundred entries in a long life put the
 * birthday problem well within reach, and roughly one life in fifty thousand
 * threw `history_ids_unique` and lost the whole year. Position in the list is
 * unique by construction, and just as deterministic under a rewind.
 */
const blank = (seed: string): LifeState =>
  ({ seed, history: [], currentYearEntryIds: [], character: { age: 0 } }) as unknown as LifeState;

describe('the life log', () => {
  it('never gives two entries the same id, however many there are', () => {
    const state = blank('collide');
    const ids = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      // The worst case for a content hash: the same line, over and over.
      pushHistory(state, 'random', '•', 'Nothing much happened.', 10);
      const id = state.history[state.history.length - 1]!.id;
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });

  it('gives the same ids when a year is replayed, so a rewind stays stable', () => {
    const a = blank('rewind');
    const b = blank('rewind');
    for (const line of ['You were born.', 'You started school.', 'You started school.']) {
      pushHistory(a, 'random', '•', line, 10);
      pushHistory(b, 'random', '•', line, 10);
    }
    expect(a.history.map((h) => h.id)).toEqual(b.history.map((h) => h.id));
  });

  it('gives different lives different ids', () => {
    const a = blank('life-a');
    const b = blank('life-b');
    pushHistory(a, 'random', '•', 'You were born.', 10);
    pushHistory(b, 'random', '•', 'You were born.', 10);
    expect(a.history[0]!.id).not.toBe(b.history[0]!.id);
  });
});
