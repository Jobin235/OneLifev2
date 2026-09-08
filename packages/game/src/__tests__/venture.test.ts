import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import type { LifeState, VentureKind } from '@lineage/shared-types';

const game = createGame();

/**
 * The commune, the zoo and the agency.
 *
 * One machine, three sets of nouns. These tests are mostly about the machine —
 * capacity, the meter that decays, upkeep that does not care how you feel about
 * it — plus one check per kind that the nouns actually came from the content.
 */
describe('things you own and run', () => {
  const clear = (state: LifeState): LifeState => {
    let s = state;
    while (s.activeEvent) s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
    return game.dismiss(s);
  };

  /** Somebody in their thirties with the money to start something. */
  const founder = (seed: string, cents = 5_000_000_00): LifeState => {
    let s = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed });
    while (s.character.alive && s.character.age < 30) {
      if (s.activeEvent) {
        s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
        continue;
      }
      s = game.ageUp(s).state;
    }
    s = clear(s);
    s.character.record.incarceration = null;
    s.character.finances.savings = cents;
    return s;
  };

  const KINDS: Array<[VentureKind, string, string, string]> = [
    ['cult', 'cult_small', 'follower', 'Devotion'],
    ['zoo', 'zoo_small', 'animal', 'Welfare'],
    ['agency', 'agency_small', 'agent', 'Prestige'],
  ];

  it('offers all three, unowned, with their prices stated', () => {
    const offers = game.ventures(founder('offer-1')).offers;
    expect(offers.map((o) => o.kind).sort()).toEqual(['agency', 'cult', 'zoo']);
    for (const offer of offers) {
      expect(offer.owned).toBe(false);
      expect(offer.tiers).toHaveLength(3);
      for (const tier of offer.tiers) expect(tier.price).toMatch(/^\$[\d,]+$/);
    }
  });

  it('speaks each one in its own words', () => {
    for (const [kind, tierId, memberWord, moraleWord] of KINDS) {
      const state = game.startVenture(founder(`words-${kind}`, 20_000_000_00), kind, tierId);
      const view = game.ventures(state).ventures[0]!;
      expect(view.kind).toBe(kind);
      expect(view.memberWord).toBe(memberWord);
      expect(view.moraleWord).toBe(moraleWord);
      expect(view.name.length).toBeGreaterThan(3);
      expect(view.members).toHaveLength(0);
    }
  });

  it('charges for the premises, and will not sell what you cannot afford', () => {
    const poor = founder('poor-1', 100_00);
    expect(() => game.startVenture(poor, 'zoo', 'zoo_large')).toThrow(/afford/);

    const rich = founder('rich-1', 20_000_000_00);
    const before = rich.character.finances.savings;
    const state = game.startVenture(rich, 'cult', 'cult_small');
    expect(state.character.finances.savings).toBeLessThan(before);
    expect(state.history.some((h) => h.line.includes(state.ventures[0]!.name))).toBe(true);
  });

  it('will not sell you two of the same thing', () => {
    const state = game.startVenture(founder('two-1', 20_000_000_00), 'cult', 'cult_small');
    expect(() => game.startVenture(state, 'cult', 'cult_medium')).toThrow(/already have one/);
    // But a different kind is fine, if you can pay for it.
    expect(() => game.startVenture(state, 'agency', 'agency_small')).not.toThrow();
  });

  it('fills up, and stops at the capacity', () => {
    let state = game.startVenture(founder('fill-1', 40_000_000_00), 'cult', 'cult_small');
    const capacity = state.ventures[0]!.capacity;

    for (let year = 0; year < 30 && state.ventures[0]!.members.length < capacity; year++) {
      for (let i = 0; i < 3; i++) {
        const view = game.ventures(state).ventures[0]!;
        const outreach = view.actions.find((a) => a.id === 'outreach');
        if (!outreach?.available) break;
        state = game.ventureAct(state, view.id, 'outreach').state;
      }
      state = clear(game.ageUp(state).state);
      if (!state.character.alive) break;
    }

    expect(state.ventures[0]!.members.length).toBeGreaterThan(0);
    expect(state.ventures[0]!.members.length).toBeLessThanOrEqual(capacity);
  });

  it('caps the year', () => {
    let state = game.startVenture(founder('cap-1', 40_000_000_00), 'cult', 'cult_small');
    const id = state.ventures[0]!.id;
    for (let i = 0; i < 3; i++) state = game.ventureAct(state, id, 'teach').state;
    expect(game.ventures(state).ventures[0]!.actionsLeft).toBe(0);
    expect(() => game.ventureAct(state, id, 'teach')).toThrow(/enough this year/);
  });

  it('lets the meter fall on its own, and empties out at the floor', () => {
    let state = game.startVenture(founder('rot-1', 40_000_000_00), 'cult', 'cult_small');
    const id = state.ventures[0]!.id;
    // Fill it, then walk away from it.
    for (let i = 0; i < 3; i++) state = game.ventureAct(state, id, 'outreach').state;
    state = clear(game.ageUp(state).state);
    for (let i = 0; i < 3; i++) state = game.ventureAct(state, id, 'outreach').state;

    const peak = state.ventures[0]!.members.length;
    expect(peak).toBeGreaterThan(0);
    const morale = state.ventures[0]!.morale;

    for (let i = 0; i < 14 && state.character.alive; i++) {
      state = clear(game.ageUp(state).state);
    }
    expect(state.ventures[0]!.morale).toBeLessThan(morale);
    expect(state.ventures[0]!.members.length).toBeLessThan(peak);
  });

  it('builds things, which is what brings the better sort', () => {
    let state = game.startVenture(founder('build-1', 60_000_000_00), 'zoo', 'zoo_small');
    const id = state.ventures[0]!.id;
    const appeal = state.ventures[0]!.appeal;

    const upgrade = game.ventures(state).ventures[0]!.upgrades.find((u) => u.affordable)!;
    state = game.ventureUpgrade(state, id, upgrade.id);
    expect(state.ventures[0]!.appeal).toBeGreaterThan(appeal);
    expect(() => game.ventureUpgrade(state, id, upgrade.id)).toThrow(/already have/);

    const rebuilt = game.ventures(state).ventures[0]!;
    expect(rebuilt.upgrades.find((u) => u.id === upgrade.id)!.owned).toBe(true);
  });

  it('pays out once it is full and tended, and costs money before that', () => {
    let state = game.startVenture(founder('pay-1', 200_000_000_00), 'cult', 'cult_medium');
    const id = state.ventures[0]!.id;

    const years: number[] = [];
    for (let year = 0; year < 16 && state.character.alive; year++) {
      for (let i = 0; i < 3; i++) {
        const view = game.ventures(state).ventures[0];
        if (!view) break;
        const pick = view.actions.find((a) => a.available && a.id !== 'tithe');
        if (!pick) break;
        state = game.ventureAct(state, view.id, pick.id).state;
      }
      state = clear(game.ageUp(state).state);
      if (state.ventures[0]) years.push(state.ventures[0].lastYear);
      void id;
    }

    // It gets better as it fills, and ends up worth having.
    expect(years.length).toBeGreaterThan(6);
    expect(Math.max(...years)).toBeGreaterThan(0);
    expect(years.at(-1)!).toBeGreaterThan(years[0]!);
  });

  it('lets a cult be cashed out, at a price', () => {
    let state = game.startVenture(founder('tithe-1', 40_000_000_00), 'cult', 'cult_small');
    const id = state.ventures[0]!.id;
    for (let i = 0; i < 3; i++) state = game.ventureAct(state, id, 'outreach').state;
    state = clear(game.ageUp(state).state);
    for (let i = 0; i < 3; i++) state = game.ventureAct(state, id, 'outreach').state;

    const members = state.ventures[0]!.members.length;
    const morale = state.ventures[0]!.morale;
    const cash = state.character.finances.cash;
    state = clear(game.ageUp(state).state);

    const result = game.ventureAct(state, id, 'tithe');
    expect(result.state.character.finances.cash).toBeGreaterThan(cash);
    expect(result.state.ventures[0]!.members.length).toBeLessThan(members);
    expect(result.state.ventures[0]!.morale).toBeLessThan(morale);
  });

  it('refuses everything from inside a cell', () => {
    const state = game.startVenture(founder('jail-1', 40_000_000_00), 'cult', 'cult_small');
    state.character.record.incarceration = {
      facility: 'the county jail',
      offence: 'Fraud',
      totalYears: 3,
      yearsServed: 0,
      paroleEligibleIn: 1,
      behaviour: 50,
    };
    state.career.current = null;
    state.character.finances.salary = 0;
    expect(() => game.ventureAct(state, state.ventures[0]!.id, 'teach')).toThrow(/in here/);
    expect(() => game.startVenture(state, 'zoo', 'zoo_small')).toThrow(/in here/);
  });
});
