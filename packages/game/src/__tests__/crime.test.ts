import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import type { LifeState } from '@lineage/shared-types';

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
    /*
     * Free, whatever the dice did on the way here. These tests are about
     * committing a crime and being sent down for it, which needs a character who
     * is not already inside — and `act` now refuses anything the prison rules
     * forbid, so a fixture that happened to land in prison would fail on the
     * first line rather than the assertion.
     */
    state.character.record.incarceration = null;
    return state;
  };

  it('gates the serious crimes behind age', () => {
    /*
     * Locked rows stay on the list now, greyed and with the reason, so the
     * question is no longer whether a nine-year-old is shown grand theft auto —
     * it is whether they can tap it. What they can see is a separate promise,
     * asserted below.
     */
    const child = at('crime-1', 9);
    const forChild = new Map(game.actions(child).map((a) => [a.id, a]));
    expect(forChild.get('porch_pirate')?.available).toBe(true);
    expect(forChild.get('bank_robbery')?.available ?? false).toBe(false);
    expect(forChild.get('grand_theft_auto')?.available ?? false).toBe(false);

    const adult = at('crime-1', 20);
    const forAdult = new Map(game.actions(adult).map((a) => [a.id, a]));
    expect(forAdult.get('bank_robbery')?.available).toBe(true);
  });

  it('says why a locked row is locked, rather than hiding it', () => {
    const child = at('crime-1', 12);
    const locked = game.actions(child).filter((a) => a.locked);
    expect(locked.length).toBeGreaterThan(0);
    // A grey row with no explanation is worse than no row at all.
    for (const row of locked) expect(row.blockedReason).toBeTruthy();
  });

  it('pays when it works and charges you when it does not', () => {
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
        /*
         * Caught is a charge, not a conviction — the lawyer and the plea decide
         * that, and until they do there is nothing on the record.
         */
        expect(result.state.activeEvent?.definitionId).toBe('criminal_charges');
        expect(result.state.character.record.convictions).toHaveLength(0);
      } else {
        paid++;
        expect(result.state.character.finances.cash).toBeGreaterThan(before);
      }
    }
    expect(paid).toBeGreaterThan(0);
    expect(caught).toBeGreaterThan(0);
  });

  /**
   * Getting caught no longer convicts you on the spot: it charges you, and the
   * lawyer and the plea are two more decisions. Walking that flow is what these
   * tests do now, and the last choice on each popup is the cheapest lawyer and
   * a guilty plea — the fastest way to a cell.
   */
  const untilSentenced = (state: LifeState, crime: string, tries = 60): LifeState | null => {
    for (let i = 0; i < tries; i++) {
      let attempt = structuredClone(state);
      attempt.seed = `${state.seed}:${i}`;
      attempt = game.act(attempt, crime).state;
      // Charge sheet, then plea. Two popups, one moment.
      for (let step = 0; step < 2 && attempt.activeEvent; step++) {
        const popup = attempt.activeEvent;
        const choice = step === 0 ? popup.choices[2]! : popup.choices[0]!;
        attempt = game.choose(attempt, popup.id, choice.id);
      }
      if (attempt.character.record.incarceration) return attempt;
    }
    return null;
  };

  it('sends you to prison for the serious ones, and prison changes what you can do', () => {
    const state = at('crime-3', 25);
    const jailed = untilSentenced(state, 'bank_robbery');
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
    const jailed = untilSentenced(state, 'train_robbery');
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
