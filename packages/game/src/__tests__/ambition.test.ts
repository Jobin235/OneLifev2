import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';

/**
 * An ambition is the answer to the category's retention problem: BitLife's
 * comes from weekly challenges bolted beside a repetitive loop, and a goal
 * chosen at birth does the same job without needing live operations.
 *
 * It only works if it survives the whole life and gets answered, which is
 * exactly what silently broke — `newLife` dropped it on the floor.
 */
describe('what a life is for', () => {
  const game = createGame();

  const liveOut = (seed: string, ambitionId: string | null) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed, ambitionId });
    while (state.character.alive) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    return state;
  };

  it('keeps the ambition from birth to the ending', () => {
    const state = liveOut('amb-keep', 'be_rich');
    expect(state.ambitionId).toBe('be_rich');
    expect(state.legacy!.ambition).not.toBeNull();
    expect(state.legacy!.ambition!.id).toBe('be_rich');
  });

  it('answers it in words rather than a score', () => {
    const state = liveOut('amb-words', 'the_long_haul');
    const verdict = state.legacy!.ambition!;
    expect(verdict.wanted.length).toBeGreaterThan(0);
    expect(verdict.verdict.length).toBeGreaterThan(0);
    // A verdict, not a percentage.
    expect(verdict.verdict).not.toMatch(/\d+%/);
  });

  it('judges honestly in both directions', () => {
    // Reaching ninety is rare; across many lives it should sometimes fail and
    // sometimes not, rather than always returning the same answer.
    const outcomes = new Set<boolean>();
    for (let i = 0; i < 14; i++) {
      outcomes.add(liveOut(`amb-judge-${i}`, 'the_long_haul').legacy!.ambition!.achieved);
    }
    expect(outcomes.size).toBe(2);
  });

  it('leaves a life without one unjudged', () => {
    const state = liveOut('amb-none', null);
    expect(state.legacy!.ambition).toBeNull();
  });

  it('every ambition can actually be judged', () => {
    // A test whose kind the judge does not handle would silently never be met.
    const state = liveOut('amb-all', null);
    for (const ambition of game.ambitions) {
      const probe = { ...state, ambitionId: ambition.id };
      expect(() => game.legacyFor(probe)).not.toThrow();
    }
  });
});
