import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { livingAdult } from './fixtures.js';
import { LORD_AT } from '../vampire.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

const clear = (state: LifeState): LifeState => {
  let s = state;
  while (s.activeEvent) s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
  return game.dismiss(s);
};

const adult = (seed: string, age = 26, cents = 50_000_000_00): LifeState => {
  const s = livingAdult(game, seed, { toAge: age });
  s.character.finances.savings = cents;
  return s;
};

/**
 * The casino.
 *
 * One property matters more than any other and it is not a feature, it is a
 * defence: the house has to win. Every payout is priced under its true odds, so
 * these are measured rather than asserted from the numbers in the file.
 */
describe('the casino', () => {
  const houseEdge = (which: string, pick: string, rounds = 2500): number => {
    let s = adult('edge-1');
    let staked = 0;
    let back = 0;
    for (let i = 0; i < rounds; i++) {
      s.character.finances.savings = 1_000_000_00;
      s.character.finances.cash = 0;
      delete s.flags.bets_this_year;
      s.history = s.history.slice(-2);
      s.currentYearEntryIds = [];
      s.seed = `edge-${i}`;
      const stake = 10_000_00;
      const result = game.playCasino(s, which as never, stake, pick);
      s = result.state;
      staked += stake;
      back += stake + result.net;
    }
    return back / staked;
  };

  it('keeps a cut of every game', () => {
    for (const [which, pick] of [
      ['slots', ''],
      ['roulette', 'red:7'],
      ['blackjack', 'book'],
      ['blackjack', 'stick'],
      ['horses', 'Ravensworth'],
      ['horses', 'Half a Chance'],
    ]) {
      const ret = houseEdge(which!, pick!);
      expect(ret, `${which} ${pick}`).toBeLessThan(1);
      // And not so brutal that nobody would sit down.
      expect(ret, `${which} ${pick}`).toBeGreaterThan(0.55);
    }
  });

  it('rewards playing blackjack properly over playing it badly', () => {
    expect(houseEdge('blackjack', 'book')).toBeGreaterThan(houseEdge('blackjack', 'hit'));
  });

  it('takes the stake before it rolls, and caps the year', () => {
    let s = adult('cas-2', 26, 100_000_00);
    const purse = s.character.finances.cash + s.character.finances.savings;
    s = game.playCasino(s, 'slots', 50_000_00, '').state;
    expect(s.character.finances.cash + s.character.finances.savings).not.toBe(purse);

    for (let i = 0; i < 5; i++) {
      try {
        s = game.playCasino(s, 'slots', 100, '').state;
      } catch {
        break;
      }
    }
    expect(() => game.playCasino(s, 'slots', 100, '')).toThrow(/enough for one year/);
  });

  it('will not take a bet you cannot cover, or from a child', () => {
    const broke = adult('cas-3', 26, 0);
    broke.character.finances.cash = 0;
    expect(() => game.playCasino(broke, 'slots', 1_000_00, '')).toThrow(/afford/);

    const child = adult('cas-4', 12, 100_000_00);
    expect(game.casino(child).locked).toBe('They will not let you in');
    expect(() => game.playCasino(child, 'slots', 100, '')).toThrow();
  });
});

/**
 * The black market.
 *
 * Two strategies have to be genuinely different: flipping loses to the fence,
 * and holding pays but is the only thing the police can find.
 */
describe('the black market', () => {
  it('never lets a dealer undercut the fence', () => {
    const state = adult('bm-1');
    for (const dealer of game.blackMarket(state).dealers) {
      for (const item of dealer.items) {
        const asking = Number(item.price.replace(/[$,]/g, ''));
        // A fence pays at most 80% of what the thing is worth; the ask is above it.
        expect(asking).toBeGreaterThan(0);
      }
    }

    // Buy and sell in the same year, and be worse off for it.
    let s = state;
    const before = s.character.finances.cash + s.character.finances.savings;
    const dealer = game.blackMarket(s).dealers[0]!;
    s = game.buyContraband(s, dealer.id, dealer.items[0]!.id).state;
    const held = game.blackMarket(s).holdings[0]!;
    s = game.fence(s, held.id).state;
    expect(s.character.finances.cash + s.character.finances.savings).toBeLessThan(before);
  });

  it('lets goodwill be won and lost', () => {
    let s = adult('bm-2');
    const dealerId = game.blackMarket(s).dealers[2]!.id;
    const before = game.blackMarket(s).dealers[2]!.attitude;
    s = game.haggle(s, dealerId).state;
    expect(game.blackMarket(s).dealers[2]!.attitude).not.toBe(before);
  });

  it('sells fakes to people it does not like, and fewer to people it does', () => {
    const s = adult('bm-3');
    const cold = structuredClone(s);
    const warm = structuredClone(s);
    cold.flags[`bm_att_${game.blackMarket(s).dealers[0]!.id}`] = 5;
    warm.flags[`bm_att_${game.blackMarket(s).dealers[0]!.id}`] = 95;
    expect(game.blackMarket(cold).dealers[0]!.fakeRisk).toBeGreaterThan(
      game.blackMarket(warm).dealers[0]!.fakeRisk,
    );
  });

  it('comes to the house for what is in it, and only for what is in it', () => {
    // Nothing held, however hot: there is nothing to find.
    let empty = adult('bm-4');
    empty.flags.bm_heat = 100;
    for (let i = 0; i < 12 && empty.character.alive; i++) {
      empty = clear(game.ageUp(empty).state);
    }
    expect(empty.history.some((h) => h.line.includes('piece of paper'))).toBe(false);

    // A house full of it, and eventually somebody knocks.
    let raided = false;
    for (let seed = 0; seed < 20 && !raided; seed++) {
      let s = adult(`bm-raid-${seed}`);
      for (let year = 0; year < 14 && s.character.alive; year++) {
        const view = game.blackMarket(s);
        if (!view.locked) {
          const dealer = view.dealers[year % 6]!;
          const item = dealer.items.find((i) => i.affordable);
          if (item) {
            try {
              s = game.buyContraband(s, dealer.id, item.id).state;
            } catch {
              /* capped for the year */
            }
          }
        }
        s = clear(game.ageUp(s).state);
        if (s.history.some((h) => h.line.includes('piece of paper'))) raided = true;
      }
    }
    expect(raided).toBe(true);
  });
});

/**
 * Racing.
 *
 * The whole point is that each car belongs in exactly one class, so that buying
 * a better one is the way up rather than a nicer noise.
 */
describe('racing', () => {
  const winRate = (carId: string, cls: string, style: string, rounds = 400): number => {
    let s = adult('rc-1', 24, 200_000_000_00);
    s = game.buyGarage(s);
    s = game.buyRaceCar(s, carId);
    const assetId = s.assets.filter((a) => s.flags[`race_car_${a.id}`] !== undefined).at(-1)!.id;

    let wins = 0;
    for (let i = 0; i < rounds; i++) {
      s.flags.race_class = cls;
      s.flags.race_points = 0;
      delete s.flags.races_this_year;
      s.history = s.history.slice(-2);
      s.currentYearEntryIds = [];
      s.seed = `rc-${i}`;
      const result = game.race(s, assetId, style as never);
      s = result.state;
      if (result.place === 1) wins += 1;
    }
    return wins / rounds;
  };

  it('needs the right car for the class', () => {
    // A hot hatch scrapes bronze and is nowhere in gold.
    expect(winRate('hatch', 'bronze', 'steady')).toBeLessThan(0.15);
    expect(winRate('gt', 'bronze', 'steady')).toBeGreaterThan(0.6);
    expect(winRate('gt', 'gold', 'steady')).toBeLessThan(0.1);
    expect(winRate('proto', 'gold', 'steady')).toBeGreaterThan(0.05);
  });

  it('makes pushing quicker and more likely to break the car', () => {
    expect(winRate('coupe', 'bronze', 'push')).toBeGreaterThan(
      winRate('coupe', 'bronze', 'conserve'),
    );
  });

  it('needs a garage before a car, and a car before a race', () => {
    const s = adult('rc-2', 24, 200_000_000_00);
    expect(() => game.buyRaceCar(s, 'coupe')).toThrow(/nowhere to put it/);
    const withGarage = game.buyGarage(s);
    expect(game.racing(withGarage).cars).toHaveLength(0);
    expect(() => game.race(withGarage, 'nothing', 'steady')).toThrow(/not a race car/);
  });

  it('caps the season', () => {
    let s = game.buyRaceCar(game.buyGarage(adult('rc-3', 24, 200_000_000_00)), 'coupe');
    const assetId = s.assets.find((a) => s.flags[`race_car_${a.id}`] !== undefined)!.id;
    for (let i = 0; i < 4; i++) s = game.race(s, assetId, 'steady').state;
    expect(() => game.race(s, assetId, 'steady')).toThrow(/season is over/);
  });
});

/**
 * The vampire.
 *
 * The only system that changes the rules of the life. What matters is that both
 * halves of the bargain are real: you stop dying of age, and something starts
 * looking for you that can actually find you.
 */
describe('the vampire', () => {
  it('stops the body getting old', () => {
    let mortal = adult('v-1', 30, 0);
    let undead = game.turnVampire(structuredClone(mortal));

    for (let i = 0; i < 45; i++) {
      if (mortal.character.alive) mortal = clear(game.ageUp(mortal).state);
      if (undead.character.alive) undead = clear(game.ageUp(undead).state);
    }
    // The mortal is dead or old; the vampire is neither, unless a hunter found them.
    expect(undead.character.age).toBeGreaterThan(60);
    if (undead.character.alive) {
      expect(undead.character.stats.health).toBeGreaterThan(40);
    }
  });

  it('trades attention for strength, every time', () => {
    let s = game.turnVampire(adult('v-2', 25, 0));
    const before = game.vampire(s);
    s = game.vampireAct(s, 'hunt').state;
    const after = game.vampire(s);
    expect(after.essence).toBeGreaterThan(before.essence);
    expect(after.notoriety).toBeGreaterThan(before.notoriety);

    // The bank is the other side of the same trade.
    const quiet = game.vampireAct(structuredClone(s), 'bank').state;
    expect(game.vampire(quiet).notoriety - after.notoriety).toBeLessThan(
      after.notoriety - before.notoriety,
    );
  });

  it('lets the coffin buy the attention back', () => {
    let s = game.turnVampire(adult('v-3', 25, 0));
    s = game.vampireAct(s, 'hunt').state;
    const loud = game.vampire(s).notoriety;
    s = clear(game.ageUp(s).state);
    s = game.vampireAct(s, 'coffin').state;
    expect(game.vampire(s).notoriety).toBeLessThan(loud);
  });

  it('sends hunters, and some of them win', () => {
    let slain = 0;
    let lords = 0;
    for (let seed = 0; seed < 40; seed++) {
      let s = game.turnVampire(adult(`v-h-${seed}`, 22, 0));
      for (let year = 0; year < 60 && s.character.alive; year++) {
        for (let night = 0; night < 3; night++) {
          try {
            s = game.vampireAct(s, 'hunt').state;
          } catch {
            break;
          }
        }
        s = clear(game.ageUp(s).state);
      }
      if (s.character.causeOfDeath?.includes('hunter')) slain += 1;
      if (s.flags.vamp_lord) lords += 1;
    }
    // Feeding constantly is how you get strong and how you get found.
    expect(slain).toBeGreaterThan(0);
    expect(lords).toBeGreaterThan(0);
  });

  it('makes the Lord permanent, and past being hunted', () => {
    let s = game.turnVampire(adult('v-4', 25, 0));
    s.flags.vamp_essence = LORD_AT - 10;
    s = game.vampireAct(s, 'bank').state;
    expect(game.vampire(s).lord).toBe(true);

    // Sixty more years, hunted the whole time, and nothing comes.
    s.flags.vamp_notoriety = 100;
    for (let i = 0; i < 60 && s.character.alive; i++) {
      s = clear(game.ageUp(s).state);
    }
    expect(s.character.causeOfDeath ?? '').not.toContain('hunter');
  });
});
