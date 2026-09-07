import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';

/**
 * Twelve career tracks meant most lives landed in the same handful of jobs.
 * These guard breadth and the education ladder that gates it.
 */
describe('careers', () => {
  const game = createGame();

  it('offers work at every level of education', () => {
    const byEducation = new Map<string, number>();
    for (const track of game.content.careers) {
      byEducation.set(
        track.requiredEducation,
        (byEducation.get(track.requiredEducation) ?? 0) + 1,
      );
    }
    // Someone who left school at sixteen still needs somewhere to go.
    for (const level of ['none', 'secondary', 'vocational', 'university', 'graduate']) {
      expect(byEducation.get(level) ?? 0).toBeGreaterThanOrEqual(8);
    }
  });

  it('spreads lives across many different jobs', () => {
    const reached = new Set<string>();
    for (let i = 0; i < 40; i++) {
      let state = game.newLife({
        countryId: 'us',
        upbringing: (['rough', 'getting_by', 'comfortable'] as const)[i % 3]!,
        seed: `spread-${i}`,
      });
      while (state.character.alive && state.character.age < 50) {
        if (state.activeEvent) {
          state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
          continue;
        }
        state = game.ageUp(state).state;
        if (state.career.current) reached.add(state.career.current.trackId);
      }
    }
    // Forty lives should not all end up in the same six jobs.
    expect(reached.size).toBeGreaterThan(20);
  });

  it('never puts anyone on a ladder their education does not reach', () => {
    const order = ['none', 'primary', 'secondary', 'vocational', 'university', 'graduate'];
    for (let i = 0; i < 25; i++) {
      let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: `gate-${i}` });
      while (state.character.alive && state.character.age < 55) {
        if (state.activeEvent) {
          state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
          continue;
        }
        state = game.ageUp(state).state;

        const job = state.career.current;
        if (!job) continue;
        const track = game.content.careersById.get(job.trackId)!;
        expect(order.indexOf(state.education.highestCompleted)).toBeGreaterThanOrEqual(
          order.indexOf(track.requiredEducation),
        );
      }
    }
  });

  it('gives every ladder somewhere to climb to', () => {
    for (const track of game.content.careers) {
      expect(track.rungs.length).toBeGreaterThan(1);
      // Pay goes up as you climb, or the ladder is pointless.
      for (let i = 1; i < track.rungs.length; i++) {
        expect(track.rungs[i]!.salary).toBeGreaterThan(track.rungs[i - 1]!.salary);
      }
    }
  });
});
