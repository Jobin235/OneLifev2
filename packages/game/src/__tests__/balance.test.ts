import { describe, expect, it } from 'vitest';
import { netWorth } from '@lineage/simulation';
import { tickWorld, NEUTRAL_INDICATORS } from '@lineage/world';
import type { LifeState, WorldIndicators } from '@lineage/shared-types';
import { Game } from '../game.js';

/**
 * Balance regression guards.
 *
 * These lock in the *shape* of a generated life, not any particular life. They
 * exist because every tuning change so far has silently broken something else:
 * fixing the health spiral made everyone rich, fixing the money made nobody
 * marry. Wide bands, so tuning stays possible; hard enough to catch a spiral.
 */

const game = new Game();

interface Sample {
  deathAges: number[];
  netWorths: number[];
  eventCounts: number[];
  marriedRate: number;
  childRate: number;
  employedRate: number;
}

const sample = (count: number, world: WorldIndicators = NEUTRAL_INDICATORS): Sample => {
  const deathAges: number[] = [];
  const netWorths: number[] = [];
  const eventCounts: number[] = [];
  let married = 0;
  let hadChild = 0;
  let employed = 0;

  for (let i = 0; i < count; i++) {
    let state: LifeState = game.newLife({
      seed: `balance-${i}`,
      countryId: 'us',
      cityId: 'portland',
      upbringing: 'getting_by',
    });
    let events = 0;
    let everMarried = false;

    while (state.character.alive && state.character.age < 130) {
      state = game.ageUp(state, world).state;
      if (state.activeEvent) {
        events += 1;
        const choices = state.activeEvent.choices;
        // Vary the strategy across lives so the sample is not one playstyle.
        state = game.choose(state, state.activeEvent.id, choices[i % choices.length]!.id, world);
      }
      if (state.relationships.some((r) => r.kind === 'spouse')) everMarried = true;
    }

    deathAges.push(state.character.deathAge!);
    netWorths.push(netWorth(state));
    eventCounts.push(events);
    if (everMarried) married += 1;
    if (state.relationships.some((r) => r.kind === 'child')) hadChild += 1;
    if (state.career.history.length > 0) employed += 1;
  }

  return {
    deathAges,
    netWorths,
    eventCounts,
    marriedRate: married / count,
    childRate: hadChild / count,
    employedRate: employed / count,
  };
};

const percentile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
};

describe('the shape of a generated life', () => {
  const s = sample(60);

  it('produces a believable spread of lifespans', () => {
    expect(percentile(s.deathAges, 0.5)).toBeGreaterThanOrEqual(62);
    expect(percentile(s.deathAges, 0.5)).toBeLessThanOrEqual(88);
    // A life sim needs both early deaths and old age.
    expect(percentile(s.deathAges, 0.1)).toBeLessThan(70);
    expect(percentile(s.deathAges, 0.9)).toBeGreaterThan(75);
  });

  it('does not let money spiral in either direction', () => {
    const median = percentile(s.netWorths, 0.5);
    // Cents. A whole ordinary life should land somewhere between broke and rich.
    expect(median).toBeGreaterThan(-50_000_000);
    expect(median).toBeLessThan(1_000_000_000);
    // Nobody should reach a number the UI cannot render meaningfully.
    expect(percentile(s.netWorths, 0.9)).toBeLessThan(20_000_000_000);
  });

  it('asks the player to decide something often enough to be a game', () => {
    // Spec §99: optimise for meaningful decisions, not screens viewed.
    expect(percentile(s.eventCounts, 0.5)).toBeGreaterThan(12);
    expect(percentile(s.eventCounts, 0.1)).toBeGreaterThan(5);
  });

  it('lets ordinary life outcomes actually happen', () => {
    expect(s.employedRate).toBeGreaterThan(0.7);
    expect(s.marriedRate).toBeGreaterThan(0.15);
    expect(s.childRate).toBeGreaterThan(0.08);
  });

  it('does not make every life the same life', () => {
    const spread = new Set(s.deathAges).size;
    expect(spread).toBeGreaterThan(15);
  });
});

describe('the world reaches the player, quietly', () => {
  it('world-gated content stays dormant in a neutral world', () => {
    // Design 1C: "a 19-year-old student: nothing happens at all."
    const fuelEvent = game.content.eventsById.get('world_fuel_spike');
    expect(fuelEvent).toBeDefined();
    const s2 = sample(8, NEUTRAL_INDICATORS);
    expect(s2.deathAges.length).toBe(8);
  });

  it('a moved world changes what can happen', () => {
    let indicators = NEUTRAL_INDICATORS;
    let random = 0.5;
    for (let tick = 0; tick < 200; tick++) {
      random = (random * 9301 + 49297) % 233280 / 233280;
      indicators = tickWorld({
        indicators,
        activeEvents: [],
        tick,
        config: game.config,
        random: () => random,
      }).indicators;
    }
    // The world walks, and stays inside sane bounds while it does.
    for (const value of Object.values(indicators)) {
      expect(value).toBeGreaterThan(19);
      expect(value).toBeLessThan(301);
    }
  });
});
