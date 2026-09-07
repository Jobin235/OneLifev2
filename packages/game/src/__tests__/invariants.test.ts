import { describe, expect, it } from 'vitest';
import { InvariantViolation, checkInvariants } from '@lineage/simulation';
import { createGame } from '../node.js';
import { ChoiceRejected } from '../game.js';

/** Spec §123–124: the properties that must hold for every life, not just one. */

const game = createGame();
const newLife = (seed: string) =>
  game.newLife({ seed, countryId: 'us', cityId: 'portland', upbringing: 'getting_by' });

describe('invariants across many lives', () => {
  it('holds for 40 independently seeded lives', () => {
    for (let i = 0; i < 40; i++) {
      let state = newLife(`property-${i}`);
      let previousAge = state.character.age;

      while (state.character.alive && state.character.age < 120) {
        state = game.ageUp(state).state;

        // Age never decreases, and never jumps.
        expect(state.character.age).toBe(previousAge + 1);
        previousAge = state.character.age;

        if (state.activeEvent) {
          state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        }
        expect(() => checkInvariants(state)).not.toThrow();
      }

      expect(state.character.alive).toBe(false);
      expect(state.character.deathAge).toBe(state.character.age);
    }
  });
});

describe('the rules the client cannot be trusted with', () => {
  it('refuses to age up while a decision is open', () => {
    let state = newLife('gate-1');
    while (!state.activeEvent && state.character.alive) state = game.ageUp(state).state;
    expect(state.activeEvent).not.toBeNull();
    expect(() => game.ageUp(state)).toThrow(/open decision/);
  });

  it('refuses to resolve the same event twice', () => {
    let state = newLife('gate-2');
    while (!state.activeEvent && state.character.alive) state = game.ageUp(state).state;

    const eventId = state.activeEvent!.id;
    const choiceId = state.activeEvent!.choices[0]!.id;
    state = game.choose(state, eventId, choiceId);

    expect(() => game.choose(state, eventId, choiceId)).toThrow(ChoiceRejected);
  });

  it('refuses a choice that was never offered', () => {
    let state = newLife('gate-3');
    while (!state.activeEvent && state.character.alive) state = game.ageUp(state).state;
    expect(() => game.choose(state, state.activeEvent!.id, 'not_a_real_choice')).toThrow();
  });

  it('stops an activity helping once its year is used up, without erroring', () => {
    let state = newLife('gate-4');
    for (let i = 0; i < 30 && state.character.alive; i++) {
      state = game.ageUp(state).state;
      if (state.activeEvent) state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }

    // "Take a course" fades after three goes and never turns harmful.
    for (let i = 0; i < 3; i++) {
      const result = game.act(state, 'take_a_course');
      expect(result.outcome).toBe('done');
      state = result.state;
    }

    const plateau = structuredClone(state);
    const fourth = game.act(state, 'take_a_course');
    expect(fourth.outcome).toBe('no_further_effect');
    // A tap that cannot help must not cost anything either.
    expect(fourth.state.character.stats).toEqual(plateau.character.stats);
    expect(fourth.state.character.finances).toEqual(plateau.character.finances);
  });

  it('lets a player keep going at something that gets worse, and makes it worse', () => {
    let state = newLife('gate-4b');
    for (let i = 0; i < 26 && state.character.alive; i++) {
      state = game.ageUp(state).state;
      if (state.activeEvent) state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }

    // Training is 'riskier': it keeps working, and over-training injures you.
    for (let i = 0; i < 3; i++) state = game.act(state, 'get_in_shape').state;
    const healthBefore = state.character.stats.health;

    const overdone = game.act(state, 'get_in_shape');
    expect(overdone.outcome).toBe('overdone');
    expect(overdone.state.character.stats.health).toBeLessThan(healthBefore);
  });

  it('has no global action budget: a year can hold as much as the player wants', () => {
    let state = newLife('gate-4c');
    for (let i = 0; i < 24 && state.character.alive; i++) {
      state = game.ageUp(state).state;
      if (state.activeEvent) state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    // Fifteen distinct actions in one year, none of them refused for "no actions left".
    for (let i = 0; i < 15; i++) {
      expect(() => game.act(state, 'call_your_mom')).not.toThrow();
    }
    // Something with no annual limit never stops working.
    expect(game.act(state, 'call_your_mom').outcome).toBe('done');
  });

  it('refuses to spend money the character does not have', () => {
    let state = newLife('gate-5');
    for (let i = 0; i < 22 && state.character.alive; i++) {
      state = game.ageUp(state).state;
      if (state.activeEvent) state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state.character.finances.cash = 0;
    state.character.finances.savings = 0;
    expect(() => game.act(state, 'travel')).toThrow(/afford/);
  });

  it('leaves state untouched when a transaction is rejected', () => {
    let state = newLife('gate-6');
    for (let i = 0; i < 25 && state.character.alive; i++) {
      state = game.ageUp(state).state;
      if (state.activeEvent) state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state.character.finances.cash = 0;
    state.character.finances.savings = 0;
    const before = structuredClone(state);

    expect(() => game.act(state, 'travel')).toThrow();
    expect(state).toEqual(before);
  });

  it('will not age up a dead character', () => {
    let state = newLife('gate-7');
    while (state.character.alive) {
      state = game.ageUp(state).state;
      if (state.activeEvent) state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    expect(() => game.ageUp(state)).toThrow(/dead/);
  });

  it('detects a corrupted state rather than persisting it', () => {
    const state = newLife('gate-8');
    state.character.stats.health = 140;
    expect(() => checkInvariants(state)).toThrow(InvariantViolation);
  });
});
