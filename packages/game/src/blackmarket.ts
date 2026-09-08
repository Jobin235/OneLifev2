import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import { clampStat, type LifeState } from '@lineage/shared-types';
import { checkInvariants, makeId, makeRng, pushHistory, refreshDerived, type Rng } from '@lineage/simulation';
import { openCharges } from './justice.js';

/**
 * The black market.
 *
 * Six dealers, each with an attitude toward you that decides both what they
 * will take for a thing and how likely that thing is to be a fake. BitLife's
 * version is exactly that — an attitude bar per dealer, and a red one means you
 * are being sold rubbish — plus the police, who are interested in what is in
 * your house. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class MarketRejected extends Error {}

/** Deals a year. */
const DEALS_A_YEAR = 4;

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

interface Dealer {
  id: string;
  name: string;
  emoji: string;
  trade: string;
  items: Array<{ id: string; label: string; emoji: string; base: number }>;
}

const DEALERS: Dealer[] = [
  {
    id: 'antiques',
    name: 'The Antique Peddler',
    emoji: '🏺',
    trade: 'Things older than the country they left',
    items: [
      { id: 'urn', label: 'A funerary urn', emoji: '🏺', base: 240_000_00 },
      { id: 'manuscript', label: 'An illuminated page', emoji: '📜', base: 610_000_00 },
      { id: 'coin', label: 'A hoard coin', emoji: '🪙', base: 95_000_00 },
    ],
  },
  {
    id: 'arms',
    name: 'The Arms Dealer',
    emoji: '🔫',
    trade: 'Nothing he will describe out loud',
    items: [
      { id: 'sidearm', label: 'A sidearm with no numbers', emoji: '🔫', base: 40_000_00 },
      { id: 'crate', label: 'A crate, unopened', emoji: '📦', base: 780_000_00 },
      { id: 'plate', label: 'Body armour', emoji: '🦺', base: 130_000_00 },
    ],
  },
  {
    id: 'art',
    name: 'The Art Thief',
    emoji: '🖼️',
    trade: 'Things with a hole in a wall behind them',
    items: [
      { id: 'sketch', label: 'A sketch, signed', emoji: '✏️', base: 420_000_00 },
      { id: 'canvas', label: 'Something off a gallery wall', emoji: '🖼️', base: 2_800_000_00 },
      { id: 'bronze', label: 'A small bronze', emoji: '🗿', base: 900_000_00 },
    ],
  },
  {
    id: 'jewels',
    name: 'The Jewel Fencer',
    emoji: '💎',
    trade: 'Stones without their paperwork',
    items: [
      { id: 'ring', label: 'A ring, resized', emoji: '💍', base: 180_000_00 },
      { id: 'necklace', label: 'A necklace nobody has reported', emoji: '📿', base: 1_400_000_00 },
      { id: 'loose', label: 'Loose stones, in paper', emoji: '💎', base: 700_000_00 },
    ],
  },
  {
    id: 'chemist',
    name: 'The Street Chemist',
    emoji: '⚗️',
    trade: 'Things that come in a bag',
    items: [
      { id: 'pills', label: 'A jar of something', emoji: '💊', base: 60_000_00 },
      { id: 'kilo', label: 'A kilo of it', emoji: '🧱', base: 520_000_00 },
      { id: 'lab', label: 'Everything to make more', emoji: '⚗️', base: 1_900_000_00 },
    ],
  },
  {
    id: 'wildlife',
    name: 'The Wildlife Smuggler',
    emoji: '🦜',
    trade: 'Things that were alive when they left',
    items: [
      { id: 'parrot', label: 'A parrot, papers pending', emoji: '🦜', base: 110_000_00 },
      { id: 'ivory', label: 'Something carved from a tusk', emoji: '🐘', base: 640_000_00 },
      { id: 'cub', label: 'A cub, in a crate', emoji: '🐆', base: 2_200_000_00 },
    ],
  },
];

const dealerById = (id: string) => DEALERS.find((d) => d.id === id);

/** Attitude lives in flags, one number per dealer, so it survives everything. */
const attitudeOf = (state: LifeState, dealerId: string): number =>
  Number(state.flags[`bm_att_${dealerId}`] ?? 45);

const setAttitude = (state: LifeState, dealerId: string, value: number): void => {
  state.flags[`bm_att_${dealerId}`] = clampStat(value);
};

/**
 * What a dealer wants for a thing this year.
 *
 * A dealer who likes you asks less. Deterministic from the seed and the age, so
 * a price does not change because the screen was closed and opened.
 */
const askingFor = (state: LifeState, dealerId: string, base: number): number => {
  const rng = makeRng(state.seed, 'bm', dealerId, state.character.age);
  /*
   * Never below what a fence pays. Goodwill is worth a fifth off the asking
   * price and no more — the first pass let a well-liked dealer undercut the
   * fence, which turned the whole screen into an arbitrage that printed
   * fifty-six million dollars a life.
   */
  const mood = 1.25 - attitudeOf(state, dealerId) / 500;
  return Math.round(base * mood * (0.9 + rng.next() * 0.2));
};

/**
 * Whether the thing is real.
 *
 * The one rule that makes attitude worth managing: a dealer who does not think
 * much of you sells you rubbish, and you do not find out until you try to move
 * it. Rolled at purchase and written down, so haggling afterwards cannot
 * change what is already in the boot of the car.
 */
const fakeChance = (attitude: number): number => Math.max(0.02, 0.55 - attitude / 130);

/* ------------------------------------------------------------------ *
 * Dealing
 * ------------------------------------------------------------------ */

export interface MarketResult {
  state: LifeState;
  line: string;
}

/** Buy something. Whether it is real is settled here and hidden until it is sold. */
export const buyContraband = (
  state: LifeState,
  dealerId: string,
  itemId: string,
  content: ContentPack,
  config: GameConfig,
): MarketResult => {
  const dealer = dealerById(dealerId);
  const item = dealer?.items.find((i) => i.id === itemId);
  if (!dealer || !item) throw new MarketRejected('nobody is selling that');

  const lock = marketLock(state);
  if (lock) throw new MarketRejected(lock.toLowerCase());

  const price = askingFor(state, dealerId, item.base);
  const purse = state.character.finances.cash + state.character.finances.savings;
  if (price > purse) throw new MarketRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    const deals = Number(state.flags.bm_deals_this_year ?? 0);
    const rng = makeRng(state.seed, 'bmbuy', dealerId, itemId, state.character.age, deals);
    state.flags.bm_deals_this_year = deals + 1;
    state.step += 1;

    const f = state.character.finances;
    const fromCash = Math.min(f.cash, price);
    f.cash -= fromCash;
    f.savings -= price - fromCash;

    const fake = rng.chance(fakeChance(attitudeOf(state, dealerId)));
    state.assets.push({
      id: makeId('bm', state.seed, itemId, state.character.age),
      kind: 'collectible',
      label: item.label,
      emoji: item.emoji,
      value: fake ? Math.round(item.base * 0.05) : item.base,
      acquiredAtAge: state.character.age,
      annualCost: 0,
      loanOutstanding: 0,
      meaning: null,
      condition: 100,
      amenityIds: [],
      rental: null,
    });
    // What it is stays with the thing, not the dealer.
    state.flags[`bm_real_${state.assets[state.assets.length - 1]!.id}`] = !fake;
    state.flags.bm_heat = Number(state.flags.bm_heat ?? 0) + 10;

    // Buying at the asking price without arguing goes down well, a little.
    setAttitude(state, dealerId, attitudeOf(state, dealerId) + 3);

    const line = `You bought ${item.label.toLowerCase()} from ${dealer.name.toLowerCase()} for ${money(price)}.`;
    pushHistory(state, 'money', item.emoji, line, 25);

    refreshDerived(state, config);
    checkInvariants(state, before);
    void content;
    return { state, line };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/**
 * Argue about the price.
 *
 * Costs nothing but goodwill, and goodwill is the currency this whole screen
 * runs on: it is the price, and it is whether the thing is real.
 */
export const haggle = (
  state: LifeState,
  dealerId: string,
  config: GameConfig,
): MarketResult => {
  const dealer = dealerById(dealerId);
  if (!dealer) throw new MarketRejected('nobody by that name');
  const lock = marketLock(state);
  if (lock) throw new MarketRejected(lock.toLowerCase());

  const before = structuredClone(state);
  try {
    const deals = Number(state.flags.bm_deals_this_year ?? 0);
    const rng = makeRng(state.seed, 'bmhag', dealerId, state.character.age, deals);
    state.flags.bm_deals_this_year = deals + 1;
    state.step += 1;

    /*
     * Charm decides it, and it is a real gamble: pushing a dealer who already
     * dislikes you is how an attitude bar goes red and stays there.
     */
    const won = rng.chance(0.25 + state.character.stats.charm / 220);
    setAttitude(state, dealerId, attitudeOf(state, dealerId) + (won ? 14 : -18));

    const line = won
      ? `${dealer.name} laughed and came down.`
      : `${dealer.name} did not laugh.`;
    pushHistory(state, 'money', dealer.emoji, line, 10);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, line };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** Move it on, and find out what you actually bought. */
export const fence = (
  state: LifeState,
  assetId: string,
  config: GameConfig,
): MarketResult => {
  const index = state.assets.findIndex((a) => a.id === assetId);
  if (index < 0) throw new MarketRejected('you do not have that');
  const lock = marketLock(state);
  if (lock) throw new MarketRejected(lock.toLowerCase());

  const before = structuredClone(state);
  try {
    const deals = Number(state.flags.bm_deals_this_year ?? 0);
    const rng = makeRng(state.seed, 'bmsell', assetId, state.character.age);
    state.flags.bm_deals_this_year = deals + 1;
    state.step += 1;

    const asset = state.assets[index]!;
    const real = state.flags[`bm_real_${assetId}`] !== false;
    /*
     * A fence takes a fence's cut. Buying and selling in the same afternoon
     * loses money on purpose: the money in this screen is in owning the thing
     * while it appreciates, and owning it is what gets the door kicked in.
     */
    const paid = Math.round(asset.value * (0.55 + rng.next() * 0.25));

    state.character.finances.cash += paid;
    state.assets.splice(index, 1);
    delete state.flags[`bm_real_${assetId}`];
    state.flags.bm_heat = Math.max(0, Number(state.flags.bm_heat ?? 0) - 5);

    const line = real
      ? `You moved ${asset.label.toLowerCase()} on for ${money(paid)}.`
      : `${asset.label} turned out to be a copy. ${money(paid)}, and a lesson.`;
    pushHistory(state, 'money', real ? '💵' : '🫤', line, real ? 20 : 40);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, line };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The police
 * ------------------------------------------------------------------ */

/**
 * What is in the house is what gets you arrested.
 *
 * Heat accumulates on every purchase and falls off slowly, and a search rolls
 * against it once a year. Selling something reduces it, which is the honest
 * incentive: contraband is dangerous to own and safe to have owned.
 */
export const advanceMarketYear = (
  state: LifeState,
  content: ContentPack,
  rng: Rng,
): void => {
  delete state.flags.bm_deals_this_year;

  /*
   * Dealers forget you. Attitude drifts back toward indifference every year,
   * so a relationship is something kept up rather than banked — without this a
   * few good years bought a permanently friendly market.
   */
  for (const dealer of DEALERS) {
    const attitude = attitudeOf(state, dealer.id);
    if (attitude > 45) setAttitude(state, dealer.id, attitude - 3);
    else if (attitude < 45) setAttitude(state, dealer.id, attitude + 2);
  }

  const holdings = state.assets.filter((a) => state.flags[`bm_real_${a.id}`] !== undefined);

  /*
   * What is in the house appreciates. Slowly, and it is the only reason to buy
   * any of this: a fence pays less than a dealer asks, so the money is in
   * holding — which is also the only thing the police can find.
   */
  for (const item of holdings) {
    item.value = Math.round(item.value * (1.03 + rng.next() * 0.05));
  }

  const heat = Number(state.flags.bm_heat ?? 0);
  if (heat <= 0) return;
  state.flags.bm_heat = Math.max(0, Math.round(heat * 0.7) - 4);
  if (holdings.length === 0) return;

  /*
   * Tuned against a probe rather than guessed: at the first numbers a patient
   * buyer holding anything at all was raided in thirty-eight lives out of
   * forty, which left no play at all — flipping loses half to the fence, and
   * holding lost everything. Now buying once every year or two stays cool
   * enough that holding is the strategy, and buying constantly is not.
   */
  const chance = Math.min(0.35, heat / 500) * (1 - state.character.stats.smarts / 250);
  if (!rng.chance(chance)) return;

  pushHistory(state, 'crime', '🚔', 'They came to the house with a piece of paper.', 70);
  for (const item of holdings) {
    delete state.flags[`bm_real_${item.id}`];
  }
  state.assets = state.assets.filter((a) => !holdings.includes(a));
  state.flags.bm_heat = 0;

  openCharges(
    state,
    {
      offence: 'Handling stolen goods',
      sentenceYears: 4,
      fine: 40_000_00,
      facility: 'the county jail',
    },
    content,
    rng,
  );
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

const ATTITUDE_WORD = (n: number): string => {
  if (n >= 75) return 'Friendly';
  if (n >= 55) return 'Warm';
  if (n >= 35) return 'Businesslike';
  if (n >= 18) return 'Cool';
  return 'Hostile';
};

export const marketLock = (state: LifeState): string | null => {
  if (!state.character.alive) return 'You are dead';
  if (state.activeEvent) return 'Answer the open decision first';
  if (state.character.record.incarceration) return 'Not from in here';
  if (state.character.age < 18) return 'Nobody will deal with a child';
  if (Number(state.flags.bm_deals_this_year ?? 0) >= DEALS_A_YEAR) {
    return 'You have been seen around enough this year';
  }
  return null;
};

export interface MarketView {
  locked: string | null;
  dealsLeft: number;
  /** How interested the police are, 0..100 for a bar. */
  heat: number;
  heatWord: string;
  dealers: Array<{
    id: string;
    name: string;
    emoji: string;
    trade: string;
    attitude: number;
    attitudeWord: string;
    /** How likely the next thing is to be a copy, as a percentage. */
    fakeRisk: number;
    items: Array<{ id: string; label: string; emoji: string; price: string; affordable: boolean }>;
  }>;
  /** What is in the house, and what it might be worth. */
  holdings: Array<{ id: string; label: string; emoji: string; value: string }>;
}

export const blackMarketView = (state: LifeState): MarketView => {
  const purse = state.character.finances.cash + state.character.finances.savings;
  const heat = Math.min(100, Number(state.flags.bm_heat ?? 0));

  return {
    locked: marketLock(state),
    dealsLeft: Math.max(0, DEALS_A_YEAR - Number(state.flags.bm_deals_this_year ?? 0)),
    heat,
    heatWord:
      heat >= 70 ? 'They know' : heat >= 40 ? 'Somebody is asking' : heat > 0 ? 'Quiet' : 'Nothing',
    dealers: DEALERS.map((dealer) => {
      const attitude = attitudeOf(state, dealer.id);
      return {
        id: dealer.id,
        name: dealer.name,
        emoji: dealer.emoji,
        trade: dealer.trade,
        attitude,
        attitudeWord: ATTITUDE_WORD(attitude),
        fakeRisk: Math.round(fakeChance(attitude) * 100),
        items: dealer.items.map((item) => {
          const price = askingFor(state, dealer.id, item.base);
          return {
            id: item.id,
            label: item.label,
            emoji: item.emoji,
            price: money(price),
            affordable: price <= purse,
          };
        }),
      };
    }),
    holdings: state.assets
      .filter((a) => state.flags[`bm_real_${a.id}`] !== undefined)
      .map((a) => ({
        id: a.id,
        label: a.label,
        emoji: a.emoji,
        // What it is worth if it is what it says it is. Nobody has checked.
        value: money(a.value),
      })),
  };
};
