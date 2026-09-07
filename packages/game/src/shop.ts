import type { GameConfig } from '@lineage/config';
import type { ContentPack, Purchasable } from '@lineage/content';
import type { LifeState } from '@lineage/shared-types';
import { checkInvariants, makeId, refreshDerived } from '@lineage/simulation';
import { pushHistory } from './ageup.js';

/**
 * Buying and selling things.
 *
 * The point of an asset is not the number it adds to net worth — it is the
 * annual cost it adds underneath, which is the part a player forgets when they
 * buy the yacht. Everything here is priced so that the running cost is the
 * interesting half of the decision.
 */

export class PurchaseRejected extends Error {}

/** Cash plus savings; what you could actually put on the table today. */
const liquid = (state: LifeState): number =>
  state.character.finances.cash + state.character.finances.savings;

/**
 * Nobody buys a house for cash.
 *
 * Requiring the full price meant the shop was empty for almost every character
 * for almost every year — the cheapest house is eleven years of an ordinary
 * salary — so buying anything at all read as broken. A deposit and a loan is
 * both how it actually works and the thing that makes the decision interesting:
 * you are not choosing whether you can afford the price, you are choosing
 * whether you can afford the payments for twenty years.
 */
const FINANCEABLE = new Set(['house', 'apartment', 'car']);
const DEPOSIT_SHARE: Record<string, number> = { house: 0.2, apartment: 0.2, car: 0.15 };
const LOAN_RATE: Record<string, number> = { house: 0.055, apartment: 0.055, car: 0.089 };
const LOAN_YEARS: Record<string, number> = { house: 25, apartment: 25, car: 5 };

const depositFor = (item: Purchasable): number =>
  Math.round(item.price * (DEPOSIT_SHARE[item.kind] ?? 0.2));

/** What the lender will want every year, for as long as it runs. */
const annualPaymentFor = (item: Purchasable): number => {
  const principal = item.price - depositFor(item);
  const rate = LOAN_RATE[item.kind] ?? 0.07;
  const years = LOAN_YEARS[item.kind] ?? 10;
  // Level annuity: the payment that clears the principal over the term.
  const factor = (rate * Math.pow(1 + rate, years)) / (Math.pow(1 + rate, years) - 1);
  return Math.round(principal * factor);
};

/**
 * A lender's rule of thumb: the payment plus what you already owe cannot eat
 * more than a third of what you bring in. It is the reason a twenty-year-old on
 * a first wage cannot buy the house with a name, and the reason they can buy
 * the flat.
 */
const canService = (state: LifeState, payment: number): boolean => {
  const f = state.character.finances;
  const income = f.salary + f.otherIncome;
  if (income <= 0) return false;
  const existing = f.debts.reduce((sum, d) => sum + Math.round(d.balance * 0.08), 0);
  return payment + existing <= Math.round(income / 3);
};

export interface ShopEntry {
  id: string;
  kind: string;
  label: string;
  emoji: string;
  price: string;
  priceCents: number;
  upkeep: string;
  available: boolean;
  blockedReason: string | null;
  owned: boolean;
  /** Whether it can be bought on a loan, and what that would take. */
  finance: {
    available: boolean;
    /** "$96,000 down, then $2,400/mo" — the whole offer, in one line. */
    terms: string;
    depositCents: number;
    blockedReason: string | null;
  };
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export const shopView = (state: LifeState, content: ContentPack): ShopEntry[] => {
  const cash = liquid(state);
  const inside = state.character.record.incarceration !== null;

  return content.purchasables
    .filter((item) => state.character.age >= item.minAge)
    .map((item) => {
      const owned = state.assets.some((a) => a.label === item.label);
      const reason = owned
        ? 'You already have one'
        : inside
          ? 'Not from in here'
          : item.price > cash
            ? "You can't afford that"
            : null;
      const financeable = FINANCEABLE.has(item.kind);
      const deposit = depositFor(item);
      const payment = annualPaymentFor(item);
      const financeReason = !financeable
        ? 'Nobody lends against this'
        : owned
          ? 'You already have one'
          : inside
            ? 'Not from in here'
            : deposit > cash
              ? `You need ${money(deposit)} down`
              : !canService(state, payment)
                ? 'They would not lend you that much'
                : null;

      return {
        id: item.id,
        kind: item.kind,
        label: item.label,
        emoji: item.emoji,
        price: money(item.price),
        priceCents: item.price,
        upkeep: item.annualCost > 0 ? `${money(item.annualCost)}/yr to keep` : 'nothing to keep',
        available: reason === null && state.character.alive && !state.activeEvent,
        blockedReason: reason,
        owned,
        finance: {
          available:
            financeReason === null && state.character.alive && !state.activeEvent && financeable,
          terms: financeable
            ? `${money(deposit)} down, then ${money(Math.round(payment / 12))}/mo for ${LOAN_YEARS[item.kind] ?? 10} years`
            : 'Cash only',
          depositCents: deposit,
          blockedReason: financeReason,
        },
      };
    });
};

const check = (state: LifeState, item: Purchasable | undefined): Purchasable => {
  if (!item) throw new PurchaseRejected('there is no such thing to buy');
  if (!state.character.alive) throw new PurchaseRejected('a dead character cannot buy anything');
  if (state.activeEvent) throw new PurchaseRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new PurchaseRejected('not from in here');
  if (state.character.age < item.minAge) throw new PurchaseRejected('you are too young');
  if (state.assets.some((a) => a.label === item.label)) {
    throw new PurchaseRejected('you already have one');
  }
  if (item.price > liquid(state)) throw new PurchaseRejected('you cannot afford that');
  return item;
};

export const buy = (
  state: LifeState,
  purchasableId: string,
  content: ContentPack,
  config: GameConfig,
  /** Put a deposit down and borrow the rest, rather than paying the price. */
  onFinance = false,
): LifeState => {
  const item = content.purchasables.find((p) => p.id === purchasableId);
  if (onFinance) checkFinance(state, item);
  else check(state, item);
  if (!item) throw new PurchaseRejected('there is no such thing to buy');

  const before = structuredClone(state);
  try {
    const paidNow = onFinance ? depositFor(item) : item.price;

    // Spend cash first, then savings — nobody empties an account they can avoid.
    const fromCash = Math.min(state.character.finances.cash, paidNow);
    state.character.finances.cash -= fromCash;
    state.character.finances.savings -= paidNow - fromCash;

    const borrowed = item.price - paidNow;
    if (borrowed > 0) {
      /*
       * The loan is a named debt like any other, so it shows up on the money
       * screen with a holder and a rate rather than as a number attached to the
       * thing — the player should be able to see who they owe.
       */
      state.character.finances.debts.push({
        id: makeId('debt', state.seed, item.id, state.character.age),
        label: item.kind === 'car' ? `Car loan · ${item.label}` : `Mortgage · ${item.label}`,
        holder: item.kind === 'car' ? 'the finance company' : 'the bank',
        balance: borrowed,
        rate: LOAN_RATE[item.kind] ?? 0.07,
        originalAmount: borrowed,
        takenAtAge: state.character.age,
      });
      state.character.finances.debt = state.character.finances.debts.reduce(
        (sum, d) => sum + d.balance,
        0,
      );
    }

    state.assets.push({
      id: makeId('ast', state.seed, item.id, state.step),
      kind: item.kind,
      label: item.label,
      emoji: item.emoji,
      value: item.price,
      loanOutstanding: borrowed,
      annualCost: item.annualCost,
      acquiredAtAge: state.character.age,
      meaning: null,
    });

    state.step += 1;
    pushHistory(
      state,
      'money',
      item.emoji,
      borrowed > 0
        ? `You put ${money(paidNow)} down on ${item.label.toLowerCase()} and borrowed the rest.`
        : `You bought ${item.label.toLowerCase()}.`,
      45,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** The same gate as `check`, but against the deposit and the lender's patience. */
const checkFinance = (state: LifeState, item: Purchasable | undefined): Purchasable => {
  if (!item) throw new PurchaseRejected('there is no such thing to buy');
  if (!state.character.alive) throw new PurchaseRejected('a dead character cannot buy anything');
  if (state.activeEvent) throw new PurchaseRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new PurchaseRejected('not from in here');
  if (state.character.age < item.minAge) throw new PurchaseRejected('you are too young');
  if (!FINANCEABLE.has(item.kind)) throw new PurchaseRejected('nobody lends against that');
  if (state.assets.some((a) => a.label === item.label)) {
    throw new PurchaseRejected('you already have one');
  }
  if (depositFor(item) > liquid(state)) throw new PurchaseRejected('you cannot cover the deposit');
  if (!canService(state, annualPaymentFor(item))) {
    throw new PurchaseRejected('they would not lend you that much');
  }
  return item;
};

export const sell = (state: LifeState, assetId: string, config: GameConfig): LifeState => {
  const index = state.assets.findIndex((a) => a.id === assetId);
  const asset = state.assets[index];
  if (index < 0 || !asset) throw new PurchaseRejected('you do not own that');
  if (!state.character.alive) throw new PurchaseRejected('a dead character cannot sell anything');
  if (state.activeEvent) throw new PurchaseRejected('answer the open decision first');

  const before = structuredClone(state);
  try {
    /*
     * You get what it is worth now, less whatever is still owed. Selling
     * something with a loan bigger than its value costs money, which is the
     * whole reason that state is worth modelling.
     */
    const proceeds = asset.value - asset.loanOutstanding;
    state.character.finances.cash += proceeds;
    state.assets.splice(index, 1);

    state.step += 1;
    pushHistory(
      state,
      'money',
      asset.emoji,
      proceeds >= 0
        ? `You sold ${asset.label.toLowerCase()}.`
        : `You sold ${asset.label.toLowerCase()} and still owed money on it.`,
      45,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};
