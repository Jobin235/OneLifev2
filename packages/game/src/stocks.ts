import type { ContentPack, Stock } from '@lineage/content';
import type { LifeState, WorldIndicators } from '@lineage/shared-types';
import { checkInvariants, makeRng, pushHistory, refreshDerived } from '@lineage/simulation';
import type { GameConfig } from '@lineage/config';

/**
 * The stock market.
 *
 * BitLife's is a private die roll per company: a risk meter, and then luck. Ours
 * is tied to the world the game already simulates — a fuel shock lifts energy
 * and hurts airlines, a rate rise lifts banks and hurts housebuilders — because
 * a market that does not move with the news gives the player no reason to read
 * it. Luck is still most of it; it is just not all of it.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class TradeRejected extends Error {}

/** How hard a sector swings, and how far it can fall. */
const VOLATILITY: Record<Stock['risk'], number> = { low: 0.07, medium: 0.17, high: 0.36 };

/**
 * A high-risk holding can lose almost everything in a single year. This is the
 * "you can lose your entire investment" that every guide warns about, and it
 * has to be real or the risk meter is decoration.
 */
const COLLAPSE_CHANCE: Record<Stock['risk'], number> = { low: 0, medium: 0.006, high: 0.018 };

/**
 * What you are paid for holding the volatile thing, on top of the base drift.
 *
 * It has to be enough to be worth the collapses. At a 1.8% annual chance a
 * high-risk holding is odds-on to survive thirty years intact and, if it does,
 * to have paid several times what the safe one did — which is the trade the
 * risk bar is promising. An earlier pass had the collapses frequent and severe
 * enough that high risk was simply a worse investment on every horizon, which
 * makes the bar a warning rather than a choice.
 */
const RISK_PREMIUM: Record<Stock['risk'], number> = { low: 0, medium: 0.012, high: 0.035 };

/**
 * What each sector does when the world moves. Positive means the indicator
 * lifts the price; negative means it hurts.
 */
const EXPOSURE: Record<string, Partial<Record<keyof WorldIndicators, number>>> = {
  utilities: { inflation: 0.2, interestRates: -0.15 },
  staples: { consumerSpending: 0.15, food: 0.25 },
  finance: { interestRates: 0.55, businessConditions: 0.3 },
  industry: { businessConditions: 0.5, fuel: -0.25 },
  housing: { housingCost: 0.5, interestRates: -0.6 },
  travel: { fuel: -0.7, consumerSpending: 0.5 },
  tech: { technologyPace: 0.8, interestRates: -0.4 },
  biotech: { publicHealth: -0.4, technologyPace: 0.5 },
  retail: { consumerSpending: 0.7, wages: 0.2 },
  energy: { fuel: 0.8, inflation: 0.2 },
  defence: { politicalTension: 0.7 },
  commodity: { inflation: 0.5, politicalTension: 0.3 },
};

/**
 * Indicators sit around 100. This turns "fuel at 128" into "fuel is 28 per cent
 * above normal", which is what the exposure table is written against.
 */
const pressure = (world: WorldIndicators, key: keyof WorldIndicators): number =>
  /*
   * Clamped. The world runs for hundreds of ticks before a life starts and an
   * indicator can wander a long way from 100; unclamped, a sector with a strong
   * negative exposure to a wandering indicator does not have a bad decade, it
   * goes to nothing and stays there.
   */
  Math.max(-0.45, Math.min(0.45, (world[key] - 100) / 100));

/**
 * The price of one share, this year.
 *
 * Computed rather than stored: a deterministic walk from the world's start to
 * now, so every player looking at the same year sees the same price and no
 * market state has to be persisted. It is O(years), which for a human lifetime
 * is nothing.
 */
/** How far back today's reading of the world can honestly be said to apply. */
const WORLD_MEMORY_YEARS = 5;

export const priceOf = (
  stock: Stock,
  state: LifeState,
  world: WorldIndicators,
  atAge = state.character.age,
): number => {
  let price = stock.basePrice;
  const sigma = VOLATILITY[stock.risk];
  const exposure = EXPOSURE[stock.sector] ?? {};

  for (let age = 1; age <= atAge; age++) {
    /*
     * Seeded from the life, so each playthrough gets its own market.
     *
     * The alternative — a single global walk — would mean every character who
     * ever lived saw the same board, and the third time through a player would
     * know which company to buy in 1994. Consistency across players only matters
     * in a shared world, and lives here do not share one.
     */
    const rng = makeRng(state.seed, 'market', stock.id, age);

    /*
     * The world's pull is applied only to the years near today's reading.
     *
     * We know what the world is doing now; we do not keep what it was doing in
     * 1994. Applying today's reading to every year of the walk was harmless
     * while the world stood still at 100 — and stopped being harmless the
     * moment it started moving, because up to six percent a year compounded
     * over a whole life turns one good reading into a sixfold gain and rewrites
     * the player's own price history behind them every time the world ticks.
     *
     * Five years is what a current reading can honestly reach back over.
     */
    const worldReaches = age > state.character.age - WORLD_MEMORY_YEARS;
    /*
     * The base drift, plus what risk pays, plus the correction for volatility
     * drag.
     *
     * A multiplicative walk with a symmetric shock has a median well below its
     * mean — the more volatile the worse — so without the third term the risky
     * companies did not merely swing, they decayed: a $9,400 share was worth $6
     * by the character's twenties on almost every path. Risk has to mean a wide
     * spread of outcomes, not a slow guaranteed loss, or nobody would ever buy
     * one and the risk bar would be a warning rather than a trade.
     *
     * For a shock uniform on [-s, s] the drag is s²/6.
     */
    let drift = 0.04 + RISK_PREMIUM[stock.risk] + (sigma * sigma) / 6;
    if (worldReaches) {
      for (const [key, weight] of Object.entries(exposure)) {
        drift += pressure(world, key as keyof WorldIndicators) * weight * 0.14;
      }
    }

    const shock = (rng.next() - 0.5) * 2 * sigma;
    price = Math.max(1, Math.round(price * (1 + drift + shock)));

    if (rng.chance(COLLAPSE_CHANCE[stock.risk])) {
      // The bad year: most of the position, gone in twelve months. Not zero — a
      // listed company almost never goes to zero — and recoverable over a long
      // enough hold, which is the only reason to keep holding one.
      price = Math.max(1, Math.round(price * (0.25 + rng.next() * 0.25)));
    }
  }
  return price;
};

export interface StockRow {
  id: string;
  name: string;
  ticker: string;
  blurb: string;
  risk: Stock['risk'];
  /** 0..100, drawn as a bar. Low risk is a short bar, not a good one. */
  riskBar: number;
  price: string;
  priceCents: number;
  /** Last year's move, as the player would say it: "+12%" or "−4%". */
  change: string;
  up: boolean;
  shares: number;
  /** What the holding is worth now, blank when there is none. */
  holdingValue: string;
  /** Profit or loss on what was paid, blank when there is none. */
  gain: string;
  gainUp: boolean;
  affordable: boolean;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

const RISK_BAR: Record<Stock['risk'], number> = { low: 22, medium: 55, high: 92 };

export const marketView = (
  state: LifeState,
  content: ContentPack,
  world: WorldIndicators,
): { rows: StockRow[]; total: string; totalCents: number; invested: string } => {
  const liquid = state.character.finances.cash + state.character.finances.savings;
  const rows = content.stocks.map((stock) => {
    const price = priceOf(stock, state, world);
    const last = state.character.age > 0 ? priceOf(stock, state, world, state.character.age - 1) : price;
    const move = last > 0 ? (price - last) / last : 0;
    const held = state.portfolio.find((h) => h.stockId === stock.id);
    const shares = held?.shares ?? 0;
    const value = shares * price;
    const gain = value - (held?.spent ?? 0);

    return {
      id: stock.id,
      name: stock.name,
      ticker: stock.ticker,
      blurb: stock.blurb,
      risk: stock.risk,
      riskBar: RISK_BAR[stock.risk],
      price: money(price),
      priceCents: price,
      change: `${move >= 0 ? '+' : '−'}${Math.abs(Math.round(move * 100))}%`,
      up: move >= 0,
      shares,
      holdingValue: shares > 0 ? money(value) : '',
      gain: shares > 0 ? `${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))}` : '',
      gainUp: gain >= 0,
      affordable: price <= liquid,
    };
  });

  const totalCents = rows.reduce((sum, r) => sum + r.shares * r.priceCents, 0);
  const investedCents = state.portfolio.reduce((sum, h) => sum + h.spent, 0);
  return {
    rows,
    total: money(totalCents),
    totalCents,
    invested: money(investedCents),
  };
};

/** What a portfolio is worth today. Counted into net worth like anything else. */
export const portfolioValue = (
  state: LifeState,
  content: ContentPack,
  world: WorldIndicators,
): number =>
  state.portfolio.reduce((sum, held) => {
    const stock = content.stocks.find((s) => s.id === held.stockId);
    return stock ? sum + held.shares * priceOf(stock, state, world) : sum;
  }, 0);

const gate = (state: LifeState): void => {
  if (!state.character.alive) throw new TradeRejected('a dead character cannot trade');
  if (state.activeEvent) throw new TradeRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new TradeRejected('not from in here');
  if (state.character.age < 18) throw new TradeRejected('you have to be 18 to hold shares');
};

export const buyShares = (
  state: LifeState,
  content: ContentPack,
  world: WorldIndicators,
  config: GameConfig,
  stockId: string,
  shares: number,
): LifeState => {
  gate(state);
  const stock = content.stocks.find((s) => s.id === stockId);
  if (!stock) throw new TradeRejected('there is no such company');
  if (shares < 1) throw new TradeRejected('buy at least one share');

  const price = priceOf(stock, state, world);
  const cost = price * shares;
  const f = state.character.finances;
  if (cost > f.cash + f.savings) throw new TradeRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    const fromCash = Math.min(f.cash, cost);
    f.cash -= fromCash;
    f.savings -= cost - fromCash;

    const held = state.portfolio.find((h) => h.stockId === stockId);
    if (held) {
      held.shares += shares;
      held.spent += cost;
    } else {
      state.portfolio.push({ stockId, shares, spent: cost });
    }

    state.character.finances.investments = portfolioValue(state, content, world);
    state.step += 1;
    pushHistory(
      state,
      'money',
      '📈',
      `You bought ${shares} ${shares === 1 ? 'share' : 'shares'} of ${stock.name}.`,
      25,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

export const sellShares = (
  state: LifeState,
  content: ContentPack,
  world: WorldIndicators,
  config: GameConfig,
  stockId: string,
  shares: number,
): LifeState => {
  gate(state);
  const stock = content.stocks.find((s) => s.id === stockId);
  const held = state.portfolio.find((h) => h.stockId === stockId);
  if (!stock || !held) throw new TradeRejected('you do not hold that');
  if (shares < 1 || shares > held.shares) throw new TradeRejected('you do not hold that many');

  const before = structuredClone(state);
  try {
    const price = priceOf(stock, state, world);
    const proceeds = price * shares;
    /*
     * The cost basis leaves in proportion, so selling half a holding takes half
     * of what you paid with it. Without this a player could sell the winning
     * half and keep a position that reports an impossible loss.
     */
    const basis = Math.round((held.spent * shares) / held.shares);
    const gain = proceeds - basis;

    held.shares -= shares;
    held.spent -= basis;
    state.character.finances.cash += proceeds;
    if (held.shares === 0) {
      state.portfolio = state.portfolio.filter((h) => h.stockId !== stockId);
    }

    state.character.finances.investments = portfolioValue(state, content, world);
    state.step += 1;
    pushHistory(
      state,
      'money',
      gain >= 0 ? '📈' : '📉',
      gain >= 0
        ? `You sold ${shares} ${shares === 1 ? 'share' : 'shares'} of ${stock.name} for a ${money(gain)} profit.`
        : `You sold ${shares} ${shares === 1 ? 'share' : 'shares'} of ${stock.name} and took a ${money(-gain)} loss.`,
      Math.abs(gain) > 500_000 ? 45 : 25,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/**
 * Says what the market did to you this year, when it did enough to notice.
 *
 * A portfolio that silently doubles is the same problem as a business that
 * silently pays you a million: the player concludes the money is made up.
 */
export const reportMarketYear = (
  state: LifeState,
  content: ContentPack,
  world: WorldIndicators,
): void => {
  const now = portfolioValue(state, content, world);
  // Net worth reads this; the finance layer has neither the content pack nor
  // the world, so the market is what tells it.
  state.character.finances.investments = now;
  if (state.portfolio.length === 0 || state.character.age < 1) return;

  const then = state.portfolio.reduce((sum, held) => {
    const stock = content.stocks.find((s) => s.id === held.stockId);
    return stock ? sum + held.shares * priceOf(stock, state, world, state.character.age - 1) : sum;
  }, 0);
  if (then <= 0) return;

  const move = (now - then) / then;
  if (Math.abs(move) < 0.18) return;

  pushHistory(
    state,
    'money',
    move > 0 ? '📈' : '📉',
    move > 0
      ? `Your shares had a good year. The portfolio is worth ${money(now)}.`
      : `The market went against you. The portfolio is down to ${money(now)}.`,
    Math.abs(move) > 0.5 ? 45 : 25,
  );
};
