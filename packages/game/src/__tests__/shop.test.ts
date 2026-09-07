import { describe, expect, it } from 'vitest';
import { PurchaseRejected } from '../shop.js';
import { createGame } from '../node.js';

/**
 * Owning things was modelled but unreachable: assets could only arrive through
 * events. The interesting half of an asset is its upkeep, so these check the
 * running cost lands as well as the purchase.
 */
describe('buying and selling', () => {
  const game = createGame();

  const rich = (seed: string) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed });
    while (state.character.alive && state.character.age < 30) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state.character.finances.savings += 200_000_000;
    // These are shop tests; a life that happened to end up inside would
    // (correctly) refuse every purchase for an unrelated reason.
    state.character.record.incarceration = null;
    return state;
  };

  it('will not sell you what you cannot afford', () => {
    const state = rich('shop-1');
    state.character.finances.cash = 0;
    state.character.finances.savings = 100_000;

    expect(() => game.buy(state, 'buy_estate')).toThrow(PurchaseRejected);
    const entry = game.shop(state).find((e) => e.id === 'buy_estate')!;
    expect(entry.available).toBe(false);
    expect(entry.blockedReason).toBe("You can't afford that");
  });

  it('takes the money and adds the upkeep', () => {
    const state = rich('shop-2');
    const before = state.character.finances.cash + state.character.finances.savings;

    const after = game.buy(state, 'buy_family_house');
    const asset = after.assets.find((a) => a.label === 'A house with a garden')!;

    expect(asset).toBeDefined();
    expect(after.character.finances.cash + after.character.finances.savings).toBe(
      before - asset.value,
    );
    // The running cost is the point.
    expect(asset.annualCost).toBeGreaterThan(0);
  });

  it('gives the money back when you sell', () => {
    const state = rich('shop-3');
    const bought = game.buy(state, 'buy_hatchback');
    const asset = bought.assets.find((a) => a.kind === 'car')!;
    const cashBefore = bought.character.finances.cash;

    const sold = game.sell(bought, asset.id);
    expect(sold.assets.some((a) => a.id === asset.id)).toBe(false);
    expect(sold.character.finances.cash).toBe(cashBefore + asset.value);
  });

  it('will not sell you two of the same thing', () => {
    const state = rich('shop-4');
    game.buy(state, 'buy_watch');
    expect(() => game.buy(state, 'buy_watch')).toThrow(/already have one/);
  });

  it('closes the shop while you are in prison', () => {
    const state = rich('shop-5');
    state.character.record.incarceration = {
      facility: 'the state prison',
      offence: 'Burglary',
      totalYears: 3,
      yearsServed: 1,
      paroleEligibleIn: 1,
      behaviour: 60,
    };
    expect(() => game.buy(state, 'buy_watch')).toThrow(/in here/);
  });
});
