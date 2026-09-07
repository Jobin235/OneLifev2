import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';

/** A job should be a place with people and a ladder, not a salary field. */
describe('work is a place', () => {
  const game = createGame();

  const employed = (seed: string) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    for (let i = 0; i < 60 && state.character.alive; i++) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      if (state.career.current) break;
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return state;
  };

  it('puts most adults into work', () => {
    /*
     * Employment used to arrive only through one probabilistic event, which left
     * a third of lives never working at all and only a quarter employed at
     * thirty. A simulation where most people are permanently unemployed is not
     * one anybody recognises.
     */
    let everEmployed = 0;
    let employedAt30 = 0;
    const lives = 24;

    for (let i = 0; i < lives; i++) {
      let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: `hire-${i}` });
      let sawJob = false;
      let at30 = false;
      while (state.character.alive && state.character.age < 45) {
        if (state.activeEvent) {
          state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
          continue;
        }
        state = game.ageUp(state).state;
        if (state.career.current) sawJob = true;
        if (state.character.age === 30 && state.career.current) at30 = true;
      }
      if (sawJob) everEmployed++;
      if (at30) employedAt30++;
    }

    expect(everEmployed).toBe(lives);
    expect(employedAt30 / lives).toBeGreaterThan(0.6);
  });

  it('puts colleagues in the workplace, not just a boss and an enemy', () => {
    for (const seed of ['work-a', 'work-b', 'work-c']) {
      const state = employed(seed);
      if (!state.career.current) continue;
      const work = game.work(state)!;
      // A manager plus at least one other person you actually sit near.
      expect(work.people.length).toBeGreaterThanOrEqual(2);
      expect(work.people.some((p) => p.role === 'Your manager')).toBe(true);
      return;
    }
    throw new Error('no seed reached employment');
  });

  it('shows where you are on the ladder', () => {
    const state = employed('work-d');
    if (!state.career.current) return;
    const work = game.work(state)!;
    expect(work.ladder.length).toBeGreaterThan(1);
    expect(work.ladder.filter((r) => r.current)).toHaveLength(1);
  });

  it('lets effort move performance, and asking too early cost it', () => {
    const state = employed('work-e');
    if (!state.career.current) return;

    // The engine mutates in place, so snapshot the numbers rather than the
    // object — `result.state` is the same reference that was passed in.
    const performanceBefore = state.career.current.performance;
    const worked = game.act(state, 'work_harder').state;
    expect(worked.career.current!.performance).toBeGreaterThan(performanceBefore);

    const salaryBefore = worked.career.current!.salary;
    const performanceAfterWork = worked.career.current!.performance;

    // Asking for a raise either works or is refused, and refusal is not free.
    const asked = game.act(worked, 'ask_for_a_raise');
    if (asked.outcome === 'backfired') {
      expect(asked.state.career.current!.performance).toBeLessThan(performanceAfterWork);
    } else {
      expect(asked.state.career.current!.salary).toBeGreaterThan(salaryBefore);
    }
  });

  it('lets you walk out', () => {
    const state = employed('work-f');
    if (!state.career.current) return;
    const after = game.act(state, 'quit').state;
    expect(after.career.current).toBeNull();
    expect(after.career.history.at(-1)!.endedBy).toBe('quit');
    expect(after.character.finances.salary).toBe(0);
  });
});
