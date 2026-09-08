import type { GameConfig } from '@lineage/config';
import { clampStat, type BlackjackHand, type Card, type LifeState } from '@lineage/shared-types';
import { checkInvariants, makeRng, pushHistory, refreshDerived } from '@lineage/simulation';
import { CasinoRejected } from './casino.js';

/**
 * Blackjack, dealt.
 *
 * The old version was a bet on a policy: pick "stick on two" or "play it the
 * way the book says", and the engine played the hand out and told you what
 * happened. That is a slot machine with a strategy dropdown. The whole of
 * blackjack is sixteen against a ten, and being the one who has to decide.
 *
 * So the hand persists between taps, the dealer's second card stays face down
 * until it matters, and the player hits, stands or doubles a card at a time.
 * The maths is unchanged in spirit — the house still wins in the long run —
 * but it is now the player's decisions that determine how badly, which is the
 * only reason to put blackjack in a game at all.
 */

const SUITS = ['♠', '♥', '♦', '♣'] as const;

/** Cents. Below the minimum the table is not interested; above it, neither is the maths. */
export const TABLE_MINIMUM = 1_000;
export const TABLE_MAXIMUM = 5_000_000;

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/**
 * A card off an infinite shoe.
 *
 * No shuffled deck is stored: `drawn` is a counter into a seeded walk, so the
 * fourth card of the third hand of a life is always the same card, and a rewind
 * deals the same hand back. An infinite shoe also means counting cards does
 * nothing, which is the honest thing to model — a real six-deck shoe would
 * make counting *almost* work, which is worse than not offering it.
 */
const draw = (state: LifeState, hand: BlackjackHand): Card => {
  const rng = makeRng(state.seed, 'blackjack', state.character.age, hand.handIndex, hand.drawn);
  hand.drawn += 1;
  return { rank: rng.int(1, 13), suit: SUITS[rng.int(0, 3)]! };
};

/** Face value: pictures are ten, an ace counts low here and is raised by `total`. */
const pip = (card: Card): number => Math.min(10, card.rank);

/**
 * The best total this hand can make, and whether an ace is doing the work.
 *
 * "Soft" matters to the player because a soft seventeen cannot bust, and to the
 * dealer because this table stands on it.
 */
export const total = (cards: Card[]): { value: number; soft: boolean } => {
  const hard = cards.reduce((sum, card) => sum + pip(card), 0);
  const hasAce = cards.some((card) => card.rank === 1);
  if (hasAce && hard + 10 <= 21) return { value: hard + 10, soft: true };
  return { value: hard, soft: false };
};

const isBlackjack = (cards: Card[]): boolean => cards.length === 2 && total(cards).value === 21;

export const cardLabel = (card: Card): string =>
  `${card.rank === 1 ? 'A' : card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank}${card.suit}`;

/* ------------------------------------------------------------------ *
 * The hand
 * ------------------------------------------------------------------ */

const guard = (state: LifeState): void => {
  if (!state.character.alive) throw new CasinoRejected('a dead character cannot gamble');
  if (state.activeEvent) throw new CasinoRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new CasinoRejected('not from in here');
  if (state.character.age < 18) throw new CasinoRejected('they will not let you in');
};

const takeStake = (state: LifeState, stake: number): void => {
  const f = state.character.finances;
  const fromCash = Math.min(f.cash, stake);
  f.cash -= fromCash;
  f.savings -= stake - fromCash;
};

/**
 * Deals. The stake leaves the purse now, and comes back — or does not — at the
 * end of the hand; a payout is always the gross, so a push returns the stake
 * and nets nothing.
 */
export const deal = (
  state: LifeState,
  stake: number,
  betsThisYear: number,
  betsAYear: number,
  config: GameConfig,
): LifeState => {
  guard(state);
  if (state.blackjack && !state.blackjack.settled) {
    throw new CasinoRejected('finish the hand you are playing');
  }
  if (betsThisYear >= betsAYear) throw new CasinoRejected('you have lost enough for one year');

  const purse = state.character.finances.cash + state.character.finances.savings;
  if (stake < TABLE_MINIMUM) throw new CasinoRejected(`the table minimum is ${money(TABLE_MINIMUM)}`);
  if (stake > TABLE_MAXIMUM) throw new CasinoRejected(`the table maximum is ${money(TABLE_MAXIMUM)}`);
  // Doubling has to stay affordable, or the option is a lie half the time.
  if (stake > purse) throw new CasinoRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    const handIndex = Number(state.flags.blackjack_hands ?? 0);
    state.flags.blackjack_hands = handIndex + 1;
    state.flags.bets_this_year = betsThisYear + 1;
    state.step += 1;

    const hand: BlackjackHand = {
      stake,
      you: [],
      dealer: [],
      drawn: 0,
      handIndex,
      doubled: false,
      settled: false,
      outcome: null,
      net: 0,
    };
    takeStake(state, stake);

    // Dealt the way it is dealt: one to the player, one up, one to the player,
    // one down. The order matters because the cards are a seeded walk.
    hand.you.push(draw(state, hand));
    hand.dealer.push(draw(state, hand));
    hand.you.push(draw(state, hand));
    hand.dealer.push(draw(state, hand));

    state.blackjack = hand;

    // A natural does not get played; it gets paid.
    if (isBlackjack(hand.you) || isBlackjack(hand.dealer)) settle(state, config);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

const live = (state: LifeState): BlackjackHand => {
  const hand = state.blackjack;
  if (!hand || hand.settled) throw new CasinoRejected('there is no hand on the table');
  return hand;
};

/** One more card. Busting settles immediately; there is nothing left to decide. */
export const hitCard = (state: LifeState, config: GameConfig): LifeState => {
  guard(state);
  const before = structuredClone(state);
  try {
    const hand = live(state);
    hand.you.push(draw(state, hand));
    state.step += 1;
    if (total(hand.you).value >= 21) settle(state, config);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** Stand: the dealer turns over and plays. */
export const standPat = (state: LifeState, config: GameConfig): LifeState => {
  guard(state);
  const before = structuredClone(state);
  try {
    live(state);
    state.step += 1;
    settle(state, config);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/**
 * Double: twice the money, exactly one more card, and then you are standing
 * whether you like it or not. Only on the first two, which is what makes it a
 * read of the dealer's up card rather than a way to chase a bad hand.
 */
export const doubleDown = (state: LifeState, config: GameConfig): LifeState => {
  guard(state);
  const before = structuredClone(state);
  try {
    const hand = live(state);
    if (hand.you.length !== 2) throw new CasinoRejected('you can only double on the first two');
    const purse = state.character.finances.cash + state.character.finances.savings;
    if (hand.stake > purse) throw new CasinoRejected('you cannot cover the double');

    takeStake(state, hand.stake);
    hand.stake *= 2;
    hand.doubled = true;
    hand.you.push(draw(state, hand));
    state.step += 1;
    settle(state, config);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/**
 * Turns the hole card over, plays the dealer out, and moves the money.
 *
 * The dealer draws to sixteen and stands on all seventeens including soft ones,
 * which is the version that gives the house about half a percent. Hitting soft
 * seventeen would be a slightly worse game for the player and is the sort of
 * detail worth getting right, because somebody who plays blackjack will notice.
 */
const settle = (state: LifeState, config: GameConfig): void => {
  const hand = state.blackjack;
  if (!hand || hand.settled) return;

  const playerBust = total(hand.you).value > 21;
  const playerNatural = isBlackjack(hand.you);
  const dealerNatural = isBlackjack(hand.dealer);

  // The dealer only plays when there is something to beat.
  if (!playerBust && !playerNatural && !dealerNatural) {
    while (total(hand.dealer).value < 17) hand.dealer.push(draw(state, hand));
  }

  const you = total(hand.you).value;
  const dealer = total(hand.dealer).value;
  const dealerBust = dealer > 21;

  let gross: number;
  let outcome: string;
  if (playerBust) {
    gross = 0;
    outcome = 'Bust';
  } else if (playerNatural && dealerNatural) {
    gross = hand.stake;
    outcome = 'Both blackjack — push';
  } else if (playerNatural) {
    // Three to two, which is the only reason to sit down at this table.
    gross = Math.round(hand.stake * 2.5);
    outcome = 'Blackjack';
  } else if (dealerNatural) {
    gross = 0;
    outcome = 'Dealer blackjack';
  } else if (dealerBust) {
    gross = hand.stake * 2;
    outcome = 'Dealer bust';
  } else if (you > dealer) {
    gross = hand.stake * 2;
    outcome = 'You win';
  } else if (you === dealer) {
    gross = hand.stake;
    outcome = 'Push';
  } else {
    gross = 0;
    outcome = 'Dealer wins';
  }

  state.character.finances.cash += gross;
  hand.net = gross - hand.stake;
  hand.outcome = outcome;
  hand.settled = true;

  const lifetime = Number(state.flags.blackjack_lifetime ?? 0) + hand.net;
  state.flags.blackjack_lifetime = lifetime;
  state.flags.blackjack_session = Number(state.flags.blackjack_session ?? 0) + hand.net;

  /*
   * A good night and a bad night, not a personality. The swing is small and
   * capped so the table cannot be farmed as a source of mood.
   */
  state.character.stats.happiness = clampStat(
    state.character.stats.happiness + (hand.net > 0 ? 4 : hand.net < 0 ? -3 : 0),
  );

  const purse = state.character.finances.cash + state.character.finances.savings;
  pushHistory(
    state,
    'money',
    hand.net > 0 ? '🎉' : '🃏',
    `${outcome} at ${you > 21 ? 'blackjack' : `${you} against ${dealerBust ? 'a bust dealer' : dealer}`}. ${
      hand.net > 0 ? `Up ${money(hand.net)}.` : hand.net < 0 ? `Down ${money(-hand.net)}.` : 'Nothing changed hands.'
    }`,
    Math.abs(hand.net) > Math.max(purse, 1) / 4 ? 45 : 10,
  );
  void config;
};

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

export interface BlackjackView {
  locked: string | null;
  purseCents: number;
  purse: string;
  minimum: number;
  maximum: number;
  /** What the player can put on this hand, given the purse and the table. */
  maxStake: number;
  hand: {
    stake: string;
    stakeCents: number;
    doubled: boolean;
    you: string[];
    /** The hole card is "🂠" until the hand is over. */
    dealer: string[];
    yourTotal: string;
    dealerTotal: string;
    settled: boolean;
    outcome: string | null;
    net: string | null;
    netPositive: boolean;
    canHit: boolean;
    canStand: boolean;
    canDouble: boolean;
  } | null;
  session: string;
  sessionCents: number;
  lifetime: string;
  lifetimeCents: number;
}

export const blackjackView = (state: LifeState, betsLeft: number): BlackjackView => {
  const purse = state.character.finances.cash + state.character.finances.savings;
  const hand = state.blackjack;
  const playing = hand && !hand.settled;

  const locked = !state.character.alive
    ? 'You are dead'
    : state.character.record.incarceration
      ? 'Not from in here'
      : state.character.age < 18
        ? 'They will not let you in'
        : betsLeft <= 0 && !playing
          ? 'You have lost enough for one year'
          : null;

  const session = Number(state.flags.blackjack_session ?? 0);
  const lifetime = Number(state.flags.blackjack_lifetime ?? 0);
  const signed = (cents: number) => (cents >= 0 ? `+${money(cents)}` : `−${money(-cents)}`);

  return {
    locked,
    purseCents: purse,
    purse: money(purse),
    minimum: TABLE_MINIMUM,
    maximum: TABLE_MAXIMUM,
    maxStake: Math.max(0, Math.min(TABLE_MAXIMUM, purse)),
    hand: hand
      ? {
          stake: money(hand.stake),
          stakeCents: hand.stake,
          doubled: hand.doubled,
          you: hand.you.map(cardLabel),
          // Face down until the dealer has a reason to turn it over.
          dealer: hand.settled
            ? hand.dealer.map(cardLabel)
            : [cardLabel(hand.dealer[0]!), '🂠'],
          yourTotal: describe(hand.you),
          dealerTotal: hand.settled
            ? describe(hand.dealer)
            : String(total([hand.dealer[0]!]).value),
          settled: hand.settled,
          outcome: hand.outcome,
          net: hand.settled ? signed(hand.net) : null,
          netPositive: hand.net >= 0,
          canHit: !hand.settled && total(hand.you).value < 21,
          canStand: !hand.settled,
          canDouble: !hand.settled && hand.you.length === 2 && hand.stake <= purse,
        }
      : null,
    session: signed(session),
    sessionCents: session,
    lifetime: signed(lifetime),
    lifetimeCents: lifetime,
  };
};

/** "17", or "soft 18" when an ace is still doing the work. */
const describe = (cards: Card[]): string => {
  const { value, soft } = total(cards);
  if (value > 21) return `${value} — bust`;
  return soft ? `soft ${value}` : String(value);
};

/** A night is a night. The running total resets when the year does. */
export const resetBlackjackSession = (state: LifeState): void => {
  delete state.flags.blackjack_session;
  if (state.blackjack?.settled) state.blackjack = null;
};
