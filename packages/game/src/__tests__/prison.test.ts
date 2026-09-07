import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { lifeView } from '../views.js';
import type { LifeState } from '@lineage/shared-types';

/**
 * Prison is a place you live in for years.
 *
 * It used to be a state the character waited out: the nav said "Prison" and the
 * screen behind it said "You are serving a sentence." — a decade of a life with
 * no surface at all, which is exactly the "half baked" the player meant.
 * See docs/BITLIFE-LOOP-SPEC.md §5.
 */
describe('prison is a place', () => {
  const game = createGame();

  /** Puts a character inside without waiting for crime to find them. */
  const imprison = (seed: string, years = 6): LifeState => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < 25) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);

    /*
     * Mirror what a conviction actually does: you lose the job on the way in.
     * The `incarcerated_has_no_job` invariant is right to reject anything else.
     */
    state.career.current = null;
    state.character.finances.salary = 0;

    state.character.record.incarceration = {
      facility: 'Ridgeway Correctional',
      offence: 'Aggravated assault',
      totalYears: years,
      yearsServed: 0,
      paroleEligibleIn: Math.max(1, Math.floor(years / 2)),
      behaviour: 55,
    };
    return state;
  };

  it('gives the sentence a screen of its own', () => {
    const view = game.prison(imprison('pr-1'));
    expect(view).not.toBeNull();
    expect(view!.facility).toBe('Ridgeway Correctional');
    expect(view!.offence).toBe('Aggravated assault');
    expect(view!.sentence).toMatch(/of 6 years served/);
    expect(view!.behaviourLabel).toBeTruthy();
    expect(view!.parole).toMatch(/parole/);
    // A menu, not a message.
    expect(view!.actions.length).toBeGreaterThan(4);
  });

  it('takes the Occupation slot and hands it back on release', () => {
    let state = imprison('pr-2', 2);
    expect(lifeView(state, game.content).navSlot).toBe('prison');
    expect(lifeView(state, game.content).station).toBe('Prisoner');

    for (let i = 0; i < 3 && state.character.record.incarceration; i++) {
      while (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
      state = game.dismiss(state);
      state = game.ageUp(state).state;
    }
    expect(state.character.record.incarceration).toBeNull();
    expect(lifeView(state, game.content).navSlot).not.toBe('prison');
    expect(state.history.some((h) => /got out after/.test(h.line))).toBe(true);
  });

  it('lets behaviour move, and says so', () => {
    let state = imprison('pr-3');
    const before = state.character.record.incarceration!.behaviour;
    state = game.act(state, 'behave_yourself').state;
    expect(state.character.record.incarceration!.behaviour).toBeGreaterThan(before);
  });

  it('will not open the parole door before it is open', () => {
    const state = imprison('pr-4', 8);
    const parole = game.prison(state)!.actions.find((a) => a.id === 'prison_parole')!;
    expect(parole.available).toBe(false);
    // And it says how long, rather than just refusing.
    expect(parole.blockedReason).toMatch(/Not eligible for \d+ more year/);

    const eligible = imprison('pr-5', 8);
    eligible.character.record.incarceration!.paroleEligibleIn = 0;
    const now = game.prison(eligible)!.actions.find((a) => a.id === 'prison_parole')!;
    expect(now.available).toBe(true);

    const out = game.act(eligible, 'prison_parole').state;
    expect(out.character.record.incarceration).toBeNull();
    expect(out.history.some((h) => /released on parole/.test(h.line))).toBe(true);
  });

  it('hides the prison menu from everyone who is not inside', () => {
    let free = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: 'pr-free' });
    while (free.character.alive && free.character.age < 30) {
      if (free.activeEvent) {
        free = game.choose(free, free.activeEvent.id, free.activeEvent.choices[0]!.id);
        continue;
      }
      free = game.ageUp(free).state;
    }
    // "Lift — only in prison" on a free character's list reads as the game
    // suggesting they get arrested.
    expect(game.actions(free).some((a) => a.group === 'prison')).toBe(false);
    expect(game.prison(free)).toBeNull();
  });
});
