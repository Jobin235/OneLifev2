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
): LifeState => {
  const item = check(
    state,
    content.purchasables.find((p) => p.id === purchasableId),
  );

  const before = structuredClone(state);
  try {
    // Spend cash first, then savings — nobody empties an account they can avoid.
    const fromCash = Math.min(state.character.finances.cash, item.price);
    state.character.finances.cash -= fromCash;
    state.character.finances.savings -= item.price - fromCash;

    state.assets.push({
      id: makeId('ast', state.seed, item.id, state.step),
      kind: item.kind,
      label: item.label,
      emoji: item.emoji,
      value: item.price,
      loanOutstanding: 0,
      annualCost: item.annualCost,
      acquiredAtAge: state.character.age,
      meaning: null,
    });

    state.step += 1;
    pushHistory(state, 'money', item.emoji, `You bought ${item.label.toLowerCase()}.`, 45);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
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
