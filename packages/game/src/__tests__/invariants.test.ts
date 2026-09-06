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

  it('refuses to act with no actions left', () => {
    let state = newLife('gate-4');
    for (let i = 0; i < 30 && state.character.alive; i++) {
      state = game.ageUp(state).state;
      if (state.activeEvent) state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state.actionsRemaining = 0;
    expect(() => game.act(state, 'get_in_shape')).toThrow(/no actions left/);
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
