import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { NEUTRAL_INDICATORS } from '@lineage/world';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * The world, out loud.
 *
 * The world engine shipped, ran, and was never once heard from: the client
 * warmed a set of indicators up at boot and then handed the same frozen numbers
 * to every age-up for eighty years, and the hourly tick it was warmed with
 * cannot move a signal five percent in any case. So no year ever differed from
 * the one before it, no world-gated content could fire, and nothing reached the
 * log. These are the three things that were wrong, held separately.
 */
const live = (seed: string, toAge: number): LifeState => {
  let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
  while (state.character.alive && state.character.age < toAge) {
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);
    state = game.ageUp(state).state;
  }
  return state;
};

describe('the world is a place things happen in', () => {
  it('moves the indicators over a life instead of holding them at neutral', () => {
    const state = live('world-move', 60);
    expect(state.world).not.toBeNull();

    const keys = Object.keys(NEUTRAL_INDICATORS) as (keyof typeof NEUTRAL_INDICATORS)[];
    const moved = keys.filter(
      (key) => Math.abs(state.world!.indicators[key] - NEUTRAL_INDICATORS[key]) > 5,
    );
    // Not "some noise": several signals a long way from where they started.
    expect(moved.length).toBeGreaterThan(2);
  });

  it('tells the player about it, sometimes, without turning the log into a newspaper', () => {
    let years = 0;
    let headlines = 0;
    for (let i = 0; i < 12; i++) {
      const state = live(`world-say-${i}`, 70);
      years += state.character.age;
      headlines += state.history.filter((h) => h.category === 'world').length;
    }
    expect(headlines).toBeGreaterThan(0);
    // Rare enough to be worth reading, common enough to exist.
    expect(headlines / years).toBeLessThan(0.5);
  });

  it('never says the same thing twice in a decade', () => {
    /*
     * Scoped to the headlines by their icons, because the atmosphere lines the
     * chronicle writes are also filed under `world` and keep to the looser
     * five-year rule the rest of the log does.
     */
    const HEADLINE = new Set(['📈', '🏦', '💼', '🏠', '⛽', '🥫', '💷', '🏭', '🛍️', '🪧', '🏥', '🛰️']);
    for (let i = 0; i < 8; i++) {
      const state = live(`world-repeat-${i}`, 75);
      const seen = new Map<string, number>();
      for (const entry of state.history) {
        if (entry.category !== 'world' || !HEADLINE.has(entry.icon)) continue;
        const before = seen.get(entry.line);
        if (before !== undefined) expect(entry.atAge - before).toBeGreaterThan(9);
        seen.set(entry.line, entry.atAge);
      }
    }
  });

  it('gives a life with a server the server’s world, not one of its own', () => {
    /*
     * One world is the whole point of having one. When something authoritative
     * is handed in, every life reads exactly it — a life quietly walking its
     * own copy alongside would mean two players in the same year disagreeing
     * about whether there had been a crash.
     */
    const boom = { ...NEUTRAL_INDICATORS, employment: 148, businessConditions: 141 };
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: 'world-given' });
    for (let i = 0; i < 25 && state.character.alive; i++) {
      while (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
      state = game.dismiss(state);
      state = game.ageUp(state, boom).state;
    }
    expect(state.world!.indicators).toEqual(boom);
  });
});
