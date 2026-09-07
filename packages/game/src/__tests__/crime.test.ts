import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';

/**
 * Crime is the genre's freedom valve: it has to actually pay, actually risk
 * something, and be gated by age so an eight-year-old is not robbing banks.
 */
describe('crime', () => {
  const game = createGame();

  const at = (seed: string, age: number) => {
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

  it('gates the serious crimes behind age', () => {
    const child = at('crime-1', 9);
    const offered = game.actions(child).map((a) => a.id);
    expect(offered).toContain('porch_pirate');
    expect(offered).not.toContain('bank_robbery');
    expect(offered).not.toContain('grand_theft_auto');

    const adult = at('crime-1', 20);
    const adultOffered = game.actions(adult).map((a) => a.id);
    expect(adultOffered).toContain('bank_robbery');
  });

  it('pays when it works and convicts when it does not', () => {
    const state = at('crime-2', 22);
    let paid = 0;
    let caught = 0;

    for (let i = 0; i < 50; i++) {
      const attempt = structuredClone(state);
      attempt.seed = `${state.seed}:${i}`;
      const before = attempt.character.finances.cash;
      const result = game.act(attempt, 'burglary');

      if (result.outcome === 'backfired') {
        caught++;
        expect(result.state.character.record.convictions.length).toBeGreaterThan(0);
      } else {
        paid++;
        expect(result.state.character.finances.cash).toBeGreaterThan(before);
      }
    }
    expect(paid).toBeGreaterThan(0);
    expect(caught).toBeGreaterThan(0);
  });

  it('sends you to prison for the serious ones, and prison changes what you can do', () => {
    const state = at('crime-3', 25);

    let jailed = null;
    for (let i = 0; i < 60 && !jailed; i++) {
      const attempt = structuredClone(state);
      attempt.seed = `${state.seed}:${i}`;
      const result = game.act(attempt, 'bank_robbery');
      if (result.state.character.record.incarceration) jailed = result.state;
    }
    expect(jailed).not.toBeNull();

    const inside = jailed!.character.record.incarceration!;
    expect(inside.totalYears).toBeGreaterThan(0);
    // A job does not survive a sentence.
    expect(jailed!.career.current).toBeNull();

    // And the ordinary world is closed while you are in there.
    const offered = game.actions(jailed!).filter((a) => a.available).map((a) => a.id);
    expect(offered).not.toContain('travel');
    expect(offered).not.toContain('bank_robbery');
  });

  it('lets you serve the time and come out', () => {
    const state = at('crime-4', 24);
    let jailed = null;
    for (let i = 0; i < 60 && !jailed; i++) {
      const attempt = structuredClone(state);
      attempt.seed = `${state.seed}:${i}`;
      const result = game.act(attempt, 'train_robbery');
      if (result.state.character.record.incarceration) jailed = result.state;
    }
    if (!jailed) return;

    let out = jailed;
    for (let i = 0; i < 20 && out.character.record.incarceration && out.character.alive; i++) {
      if (out.activeEvent) {
        out = game.choose(out, out.activeEvent.id, out.activeEvent.choices[0]!.id);
        continue;
      }
      out = game.ageUp(out).state;
    }
    if (out.character.alive) {
      expect(out.character.record.incarceration).toBeNull();
      // The conviction stays on the record after the sentence ends.
      expect(out.character.record.convictions.length).toBeGreaterThan(0);
    }
  });
});
