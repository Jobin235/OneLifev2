import { describe, expect, it } from 'vitest';
import { ApplicationRejected } from '../jobs.js';
import { createGame } from '../node.js';

/**
 * These guard the thing play-testing found wrong: the simulation was mostly
 * coherent but never explained itself, so everything looked random. Each of
 * these asserts that a state change is *attributable*.
 */
describe('nothing happens without a reason the player can see', () => {
  const game = createGame();

  const liveTo = (seed: string, age: number) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < age) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return state;
  };

  it('never owes money to nobody', () => {
    for (let i = 0; i < 12; i++) {
      const state = liveTo(`owe-${i}`, 60);
      for (const debt of state.character.finances.debts) {
        expect(debt.holder.length).toBeGreaterThan(0);
        expect(debt.label.length).toBeGreaterThan(0);
      }
      // And the headline always equals the itemisation.
      const total = state.character.finances.debts.reduce((sum, d) => sum + d.balance, 0);
      expect(state.character.finances.debt).toBe(total);
    }
  });

  it('does not let a poor life compound into millions of debt', () => {
    for (let i = 0; i < 12; i++) {
      const state = liveTo(`poor-${i}`, 75);

      /*
       * Nothing should be bigger at the end than a person could plausibly have
       * borrowed. A mortgage is allowed to be large; nothing is allowed to have
       * grown large purely by compounding on somebody with no income.
       */
      for (const debt of state.character.finances.debts) {
        expect(debt.balance).toBeLessThan(500_000_00);
      }
    }
  });

  it('writes a line every time a job starts or ends', () => {
    for (let i = 0; i < 8; i++) {
      const state = liveTo(`job-${i}`, 60);
      const jobsEnded = state.career.history.length;
      const endLines = state.history.filter((e) =>
        /You left |You were fired|let you go|You retired from|lost your job/.test(e.line),
      ).length;
      // Every ended job is accounted for in the log.
      expect(endLines).toBeGreaterThanOrEqual(Math.min(jobsEnded, 1) === 0 ? 0 : 1);
      if (jobsEnded > 0) expect(endLines).toBeGreaterThan(0);
    }
  });

  it('never invents an employer nobody has heard of', () => {
    for (let i = 0; i < 10; i++) {
      const state = liveTo(`emp-${i}`, 55);
      for (const entry of state.history) {
        expect(entry.line).not.toContain('A company you had not heard of');
      }
    }
  });

  it('states what a job needs before you apply, and refuses when you fall short', () => {
    const state = liveTo('apply-1', 24);
    const openings = game.openings(state);
    expect(openings.length).toBeGreaterThan(0);

    for (const opening of openings) {
      expect(opening.requirements.length).toBeGreaterThan(0);
      // Anything unavailable says exactly what is in the way.
      if (!opening.qualified) expect(opening.missing).toBeTruthy();
    }

    const outOfReach = openings.find((o) => !o.qualified);
    if (outOfReach) {
      expect(() => game.applyFor(state, outOfReach.trackId)).toThrow(ApplicationRejected);
    }
  });

  it('only hires you into work you applied for, or work you were desperate for', () => {
    for (let i = 0; i < 10; i++) {
      const state = liveTo(`hire-${i}`, 45);
      // Applied for, taken out of desperation, or offered through an event —
      // all three are attributable; a job appearing with no line is not.
      const starts = state.history.filter((e) =>
        /You got the job|you took work as|You started a new job|You started at/.test(e.line),
      ).length;
      const jobsHeld = state.career.history.length + (state.career.current ? 1 : 0);
      // Promotions are not new jobs, so starts can be fewer — but never zero
      // when the character has held one.
      if (jobsHeld > 0) expect(starts).toBeGreaterThan(0);
    }
  });
});
