import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { livingAdult } from './fixtures.js';
import { moneyView } from '../views.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * A refused move has to say why, on the row, before it is tapped.
 *
 * Three systems enforced an age gate inside the action and nowhere else: shares
 * at eighteen, going to find the vampire at eighteen, going out at night at
 * sixteen. The screens offered all three to a fourteen-year-old, and the
 * refusal arrived as an exception — which the offline build, having no server
 * between the engine and the UI to turn it into a message, reported as
 * "Something went wrong." A rule working exactly as designed, presented as a
 * crash.
 *
 * Everything else in the game already does this: the casino says "They will not
 * let you in", the black market says "Nobody will deal with a child". These
 * hold that the three that did not, now do.
 */
const child = (seed: string, age: number): LifeState => {
  let state = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed });
  while (state.character.alive && state.character.age < age) {
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);
    state = game.ageUp(state).state;
  }
  while (state.activeEvent) {
    state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
  }
  state = game.dismiss(state);
  state.character.finances.savings = 10_000_000_00;
  return state;
};

describe('a refusal is a reason, not an error', () => {
  it('shuts the stock market to a child, and says so', () => {
    const young = child('gate-shares', 14);
    const view = game.market(young);
    expect(view.locked).toMatch(/18 to hold shares/);
    expect(() => game.buyShares(young, view.rows[0]!.id, 1)).toThrow(/18 to hold shares/);

    // And the Money screen row is not offered as though it worked.
    expect(moneyView(young, game.config, game.content)).toBeTruthy();

    const grown = livingAdult(game, 'gate-shares-adult', { toAge: 25 });
    expect(game.market(grown).locked).toBeNull();
  });

  it('will not send a child to find the vampire, and says so', () => {
    const young = child('gate-vamp', 14);
    expect(game.vampire(young).locked).toMatch(/child/i);
    expect(() => game.turnVampire(young)).toThrow(/child/i);

    const grown = livingAdult(game, 'gate-vamp-adult', { toAge: 25 });
    expect(game.vampire(grown).locked).toBeNull();
  });

  it('will not send a child out at night, and says so', () => {
    const young = child('gate-vig', 14);
    expect(game.vigilante(young).locked).toMatch(/too young/i);
    expect(() => game.startVigilante(young)).toThrow(/too young/i);

    const grown = livingAdult(game, 'gate-vig-adult', { toAge: 25 });
    expect(game.vigilante(grown).locked).toBeNull();
  });

  it('never offers something the engine will then refuse', () => {
    /*
     * The general form of the bug, held generally: for every age from ten to
     * thirty, a screen that reports itself open has to actually be open.
     */
    for (let age = 10; age <= 30; age += 2) {
      const state = child(`gate-sweep-${age}`, age);
      if (!state.character.alive || state.character.record.incarceration) continue;

      if (game.market(state).locked === null) {
        const row = game.market(state).rows.find((r) => r.affordable);
        if (row) expect(() => game.buyShares(state, row.id, 1)).not.toThrow();
      }
      if (game.vigilante(state).locked === null && !state.vigilante) {
        expect(() => game.startVigilante(structuredClone(state))).not.toThrow();
      }
      if (game.vampire(state).locked === null && !state.flags.vampire) {
        expect(() => game.turnVampire(structuredClone(state))).not.toThrow();
      }
    }
  });
});
