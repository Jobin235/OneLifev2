import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { CHECK_FEE, marketRent } from '../landlord.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * Property was a thing you owned. This makes it a thing that pays you and asks
 * for something back — BitLife's two meters, a background check worth paying
 * for, and an eviction that costs you the deposit.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
describe('being a landlord', () => {
  /** An owner with a flat, a wage, and nobody in it yet. */
  const owner = (seed: string): LifeState => {
    let state = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed });
    while (state.character.alive && state.character.age < 32) {
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
    state.character.record.incarceration = null;
    state.character.finances.savings = 600_000_00;
    state.character.finances.salary = 9_000_000;

    const flat = game.shop(state).find((e) => e.kind === 'apartment' && e.available)!;
    return game.buy(state, flat.id, false);
  };

  const flatOf = (state: LifeState) => game.properties(state)[0]!;

  const live = (state: LifeState, years: number): LifeState => {
    for (let i = 0; i < years && state.character.alive; i++) {
      while (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
      state = game.dismiss(state);
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return game.dismiss(state);
  };

  it('shows the state of the place and what can be done about it', () => {
    const row = flatOf(owner('ll-view'));
    expect(row.tenant).toBeNull();
    expect(row.condition).toBeGreaterThan(50);
    expect(row.conditionWord).toBeTruthy();
    expect(row.marketRent).toMatch(/\$[\d,]+\/yr/);

    const byId = new Map(row.actions.map((a) => [a.id, a]));
    expect(byId.get('let')!.available).toBe(true);
    // Nothing to do to a tenant who does not exist, and it says so.
    expect(byId.get('inspect')!.available).toBe(false);
    expect(byId.get('evict')!.note).toMatch(/Nobody/);
  });

  it('offers three applicants, and the one who pays most is often the risk', () => {
    const state = game.manageProperty(owner('ll-apply'), flatOf(owner('ll-apply')).assetId, 'let');
    const popup = state.activeEvent!;
    expect(popup.definitionId).toBe('rental_applicants');
    expect(popup.facts).toHaveLength(3);
    // Distinct names: a duplicate on a three-row list reads as a bug.
    const names = popup.facts.map((f) => f.label.split(' ')[0]);
    expect(new Set(names).size).toBe(3);
    // The check is offered, priced, before anybody gets the keys.
    expect(popup.choices[0]!.label).toMatch(/background check/i);
    expect(popup.choices[0]!.price).toBeTruthy();
  });

  it('tells you about the same three people you paid to check', () => {
    /*
     * The bug this exists to stop: the checks re-rolled the applicant list, so
     * paying for references handed you three different strangers.
     */
    let state = owner('ll-check');
    const before = state.character.finances.cash + state.character.finances.savings;
    state = game.manageProperty(state, flatOf(state).assetId, 'let');
    const first = state.activeEvent!.facts.map((f) => f.label);

    state = game.choose(state, state.activeEvent!.id, 'check');
    const after = state.activeEvent!;

    expect(after.facts.map((f) => f.label)).toEqual(first);
    // And now you can see what they are actually like.
    expect(after.meters).toHaveLength(3);
    expect(Math.max(...after.meters.map((m) => m.value))).toBeGreaterThan(
      Math.min(...after.meters.map((m) => m.value)),
    );
    const spent = before - (state.character.finances.cash + state.character.finances.savings);
    expect(spent).toBe(CHECK_FEE);
  });

  it('collects the rent, and holds the deposit', () => {
    let state = owner('ll-rent');
    const assetId = flatOf(state).assetId;
    state = game.manageProperty(state, assetId, 'let');
    state = game.dismiss(game.choose(state, state.activeEvent!.id, 'a'));

    const asset = state.assets.find((a) => a.id === assetId)!;
    expect(asset.rental).not.toBeNull();
    expect(asset.rental!.deposit).toBeGreaterThan(0);

    const before = state.character.finances.cash;
    state = live(state, 1);
    // Rent arrived, or the log says why not.
    const paid = state.character.finances.cash > before;
    const complained = state.history.some((h) => /did not pay the rent/.test(h.line));
    expect(paid || complained).toBe(true);
  });

  it('lets the place fall apart, and lets you put it right', () => {
    let state = owner('ll-decay');
    const assetId = flatOf(state).assetId;
    state = game.manageProperty(state, assetId, 'let');
    state = game.dismiss(game.choose(state, state.activeEvent!.id, 'a'));

    const start = state.assets.find((a) => a.id === assetId)!.condition;
    state = live(state, 12);
    const worn = state.assets.find((a) => a.id === assetId)!.condition;
    expect(worn).toBeLessThan(start);

    state = game.manageProperty(state, assetId, 'maintain');
    expect(state.assets.find((a) => a.id === assetId)!.condition).toBeGreaterThan(worn);
    expect(state.history.some((h) => /putting .* right/.test(h.line))).toBe(true);
  });

  it('makes an amenity raise the rent it commands', () => {
    let state = owner('ll-amenity');
    const assetId = flatOf(state).assetId;
    const before = marketRent(state.assets.find((a) => a.id === assetId)!);

    const kitchen = game.amenities(state, assetId).find((a) => a.id === 'new_kitchen')!;
    expect(kitchen.available).toBe(true);
    state = game.manageProperty(state, assetId, 'amenity', 'new_kitchen');

    const asset = state.assets.find((a) => a.id === assetId)!;
    expect(asset.amenityIds).toContain('new_kitchen');
    expect(marketRent(asset)).toBeGreaterThan(before);
    // It costs something to keep, which is the half people forget.
    expect(game.amenities(state, assetId).find((a) => a.id === 'new_kitchen')!.owned).toBe(true);
  });

  it('gives the deposit back on an eviction, and keeps it when they owe you', () => {
    let state = owner('ll-evict');
    const assetId = flatOf(state).assetId;
    state = game.manageProperty(state, assetId, 'let');
    state = game.dismiss(game.choose(state, state.activeEvent!.id, 'a'));

    const asset = state.assets.find((a) => a.id === assetId)!;
    const deposit = asset.rental!.deposit;
    const before = state.character.finances.cash;

    state = game.manageProperty(state, assetId, 'evict');
    expect(state.assets.find((a) => a.id === assetId)!.rental).toBeNull();
    expect(state.character.finances.cash).toBe(before - deposit);
    expect(state.history.some((h) => /evicted .* gave back/.test(h.line))).toBe(true);
  });

  it('will not let you manage somewhere you do not own', () => {
    const state = owner('ll-gate');
    expect(() => game.manageProperty(state, 'not_a_property', 'let')).toThrow();
    // Nor rent out a car.
    expect(game.properties(state).every((p) => /flat|house|apartment/i.test(p.label))).toBe(true);
  });
});
