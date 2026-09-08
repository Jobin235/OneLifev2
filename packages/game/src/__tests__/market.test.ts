import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { livingAdult } from './fixtures.js';
import { NEUTRAL_INDICATORS } from '@lineage/world';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * The billionaire route needs somewhere to put the money, and BitLife's answer
 * is a risk meter and a die roll. Ours is tied to the world the game already
 * simulates, because a market that does not move with the news gives the player
 * no reason to read it. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
describe('the stock market', () => {
  const investor = (seed: string, cash = 300_000_00): LifeState => {
    const state = livingAdult(game, seed, { toAge: 25 });
    state.character.finances.savings = cash;
    return state;
  };

  const hold = (state: LifeState, years: number): LifeState => {
    for (let i = 0; i < years && state.character.alive; i++) {
      while (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
      state = game.dismiss(state);
      state = game.ageUp(state).state;
    }
    // Leave it answerable: trading is refused while a decision is open.
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return game.dismiss(state);
  };

  it('states the price, the move and the risk before you buy', () => {
    const rows = game.market(investor('mk-1')).rows;
    expect(rows.length).toBeGreaterThan(6);
    for (const row of rows) {
      expect(row.price).toMatch(/^\$[\d,]+$/);
      expect(row.change).toMatch(/^[+−]\d+%$/);
      expect(['low', 'medium', 'high']).toContain(row.risk);
      expect(row.blurb.length).toBeGreaterThan(10);
    }
    // The bar has to sort the same way the label does.
    const low = rows.find((r) => r.risk === 'low')!;
    const high = rows.find((r) => r.risk === 'high')!;
    expect(high.riskBar).toBeGreaterThan(low.riskBar);
  });

  it('takes the money, gives the shares, and counts them into net worth', () => {
    const state = investor('mk-2');
    const before = state.character.finances.cash + state.character.finances.savings;
    const row = game.market(state).rows.find((r) => r.affordable)!;

    const after = game.buyShares(state, row.id, 10);
    const spent = before - (after.character.finances.cash + after.character.finances.savings);

    expect(spent).toBe(row.priceCents * 10);
    expect(after.portfolio.find((h) => h.stockId === row.id)?.shares).toBe(10);
    expect(after.character.finances.investments).toBeGreaterThan(0);
    expect(after.history.some((h) => /bought 10 shares/.test(h.line))).toBe(true);
  });

  it('reports a real profit or loss when you sell', () => {
    let state = investor('mk-3');
    const row = game.market(state).rows.find((r) => r.affordable && r.risk === 'low')!;
    state = game.buyShares(state, row.id, 20);
    state = hold(state, 12);

    const before = state.character.finances.cash;
    state = game.sellShares(state, row.id, 20);
    expect(state.character.finances.cash).toBeGreaterThan(before);
    expect(state.portfolio.find((h) => h.stockId === row.id)).toBeUndefined();
    expect(state.history.some((h) => /sold 20 shares .* (profit|loss)/.test(h.line))).toBe(true);
  });

  it('takes the cost basis with a partial sale', () => {
    /*
     * Without this a player could sell the half that went up, keep the rest, and
     * be shown an impossible loss on a position that had only ever gained.
     */
    let state = investor('mk-4');
    const row = game.market(state).rows.find((r) => r.affordable)!;
    state = game.buyShares(state, row.id, 40);
    const spent = state.portfolio.find((h) => h.stockId === row.id)!.spent;

    state = game.sellShares(state, row.id, 10);
    const held = state.portfolio.find((h) => h.stockId === row.id)!;
    expect(held.shares).toBe(30);
    expect(held.spent).toBe(spent - Math.round((spent * 10) / 40));
  });

  it('makes risk mean a wider spread, not a worse investment', () => {
    /*
     * The tuning this test exists to protect: an earlier version had collapses
     * frequent and deep enough that high risk lost on nearly every path, which
     * turns the risk bar from a choice into a warning nobody would ignore.
     */
    const outcomes = { low: [] as number[], high: [] as number[] };
    for (let i = 0; i < 16; i++) {
      for (const [band, ids] of [
        ['low', ['argent_gold', 'hallow_foods', 'meridian_grid']],
        ['high', ['orrery_systems', 'vantage_labs', 'kestrel_air']],
      ] as const) {
        let state = investor(`mk-spread-${i}`);
        for (const id of ids) {
          const row = game.market(state).rows.find((r) => r.id === id)!;
          const shares = Math.floor(3_000_000 / row.priceCents);
          if (shares > 0) state = game.buyShares(state, id, shares);
        }
        const invested = state.portfolio.reduce((sum, h) => sum + h.spent, 0);
        if (invested <= 0) continue;
        state = hold(state, 30);
        outcomes[band].push(game.market(state).totalCents / invested);
      }
    }

    const spread = (xs: number[]) => Math.max(...xs) / Math.min(...xs);
    expect(outcomes.low.length).toBeGreaterThan(5);
    expect(outcomes.high.length).toBeGreaterThan(5);

    // High risk swings much harder than low risk, in both directions.
    expect(spread(outcomes.high)).toBeGreaterThan(spread(outcomes.low));
    // And it is worth taking: the best high-risk run beats the best safe one.
    expect(Math.max(...outcomes.high)).toBeGreaterThan(Math.max(...outcomes.low));
    /*
     * And it can genuinely go wrong: the worst high-risk run comes in under the
     * middling safe one. Comparing the two minima directly would be tighter and
     * would also be a coin flip on this sample size — the point is that a bad
     * high-risk decade costs you the safe return, not that it is always worse
     * than the worst possible safe decade.
     */
    const sortedLow = [...outcomes.low].sort((a, b) => a - b);
    const medianLow = sortedLow[Math.floor(sortedLow.length / 2)]!;
    expect(Math.min(...outcomes.high)).toBeLessThan(medianLow);
  });

  it('gives each life its own market', () => {
    const a = game.market(investor('mk-world-a')).rows.map((r) => r.priceCents);
    const b = game.market(investor('mk-world-b')).rows.map((r) => r.priceCents);
    expect(a).not.toEqual(b);
  });

  it('moves with the world rather than only with the dice', () => {
    const state = investor('mk-world');
    const calm = { ...NEUTRAL_INDICATORS };
    const fuelShock = { ...NEUTRAL_INDICATORS, fuel: 140 };

    const energyCalm = game.market(state, calm).rows.find((r) => r.id === 'pellinore_oil')!;
    const energyShock = game.market(state, fuelShock).rows.find((r) => r.id === 'pellinore_oil')!;
    const airlineCalm = game.market(state, calm).rows.find((r) => r.id === 'kestrel_air')!;
    const airlineShock = game.market(state, fuelShock).rows.find((r) => r.id === 'kestrel_air')!;

    // Expensive fuel is good for the people selling it and bad for the airline.
    expect(energyShock.priceCents).toBeGreaterThan(energyCalm.priceCents);
    expect(airlineShock.priceCents).toBeLessThan(airlineCalm.priceCents);
  });

  it('will not let a child or a prisoner trade', () => {
    let child = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed: 'mk-child' });
    child.character.finances.savings = 100_000_00;
    expect(() => game.buyShares(child, 'argent_gold', 1)).toThrow(/18/);

    const inside = investor('mk-inside');
    inside.career.current = null;
    inside.character.finances.salary = 0;
    inside.character.record.incarceration = {
      facility: 'Ridgeway', offence: 'Fraud', totalYears: 4,
      yearsServed: 0, paroleEligibleIn: 2, behaviour: 50,
    };
    expect(() => game.buyShares(inside, 'argent_gold', 1)).toThrow(/in here/);
  });
});
