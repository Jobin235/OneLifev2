import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { livingAdult } from './fixtures.js';
import { total } from '../blackjack.js';
import type { Card, LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * Blackjack.
 *
 * It used to be a bet on a *policy* — "stick on two", "play it the way the book
 * says" — resolved in one tap. That is a slot machine with a strategy dropdown,
 * and it removes the only interesting thing about the game, which is looking at
 * sixteen against a ten and having to decide. These hold the two things that
 * makes it a game instead: the hand waits for the player, and the house still
 * wins.
 */
const player = (seed: string, purse = 10_000_000_00): LifeState => {
  const state = livingAdult(game, seed, { toAge: 25, upbringing: 'comfortable' });
  state.character.finances.savings = purse;
  state.character.finances.cash = 0;
  return state;
};

/** Plays a hand out roughly the way the book says, and reports what it cost. */
const playOut = (state: LifeState, stake: number): { state: LifeState; staked: number; net: number } => {
  let s = game.dealBlackjack(state, stake);
  let staked = stake;
  while (!s.blackjack!.settled) {
    const hand = s.blackjack!;
    const mine = total(hand.you);
    const up = Math.min(10, hand.dealer[0]!.rank);
    if (hand.you.length === 2 && (mine.value === 10 || mine.value === 11) && up <= 9) {
      s = game.doubleBlackjack(s);
      staked += stake;
    } else if (mine.value < 17 || (mine.soft && mine.value < 18)) {
      s = game.hitBlackjack(s);
    } else {
      s = game.standBlackjack(s);
    }
  }
  return { state: s, staked, net: s.blackjack!.net };
};

const card = (rank: number): Card => ({ rank, suit: '♠' });

describe('blackjack is a hand, not a policy', () => {
  it('deals two each, hides the hole card, and waits', () => {
    const state = game.dealBlackjack(player('bj-deal'), 10_00);
    const hand = state.blackjack!;
    expect(hand.you).toHaveLength(2);
    expect(hand.dealer).toHaveLength(2);

    const view = game.blackjack(state);
    // Whatever the dealer's second card is, the player cannot see it yet.
    if (!view.hand!.settled) {
      expect(view.hand!.dealer[1]).toBe('🂠');
      expect(view.hand!.canHit).toBe(true);
      expect(view.hand!.canDouble).toBe(true);
    }
  });

  it('counts an ace both ways, and says which', () => {
    expect(total([card(1), card(6)])).toEqual({ value: 17, soft: true });
    // Once a third card would bust the soft total, the ace goes back to one.
    expect(total([card(1), card(6), card(10)])).toEqual({ value: 17, soft: false });
    expect(total([card(1), card(1)])).toEqual({ value: 12, soft: true });
    expect(total([card(13), card(12), card(3)])).toEqual({ value: 23, soft: false });
  });

  it('takes the stake on the deal and pays the gross at the end', () => {
    let state = player('bj-money', 100_000_00);
    const before = state.character.finances.savings;
    state = game.dealBlackjack(state, 10_000_00);
    // Gone before a single card is turned over.
    expect(state.character.finances.cash + state.character.finances.savings).toBe(before - 10_000_00);

    while (!state.blackjack!.settled) state = game.standBlackjack(state);
    const after = state.character.finances.cash + state.character.finances.savings;
    expect(after - before).toBe(state.blackjack!.net);
  });

  it('will not let you double after the third card, or change your bet mid-hand', () => {
    let state = game.dealBlackjack(player('bj-double'), 10_00);
    if (state.blackjack!.settled) return; // A natural is paid, not played.
    const stake = state.blackjack!.stake;
    state = game.hitBlackjack(state);
    if (state.blackjack!.settled) return;

    expect(() => game.doubleBlackjack(state)).toThrow(/first two/);
    expect(() => game.dealBlackjack(state, 50_00)).toThrow(/finish the hand/);
    expect(state.blackjack!.stake).toBe(stake);
  });

  it('doubles the stake and gives exactly one card', () => {
    for (let i = 0; i < 20; i++) {
      let state = game.dealBlackjack(player(`bj-dd-${i}`), 10_00);
      if (state.blackjack!.settled) continue;
      const stake = state.blackjack!.stake;
      state = game.doubleBlackjack(state);
      expect(state.blackjack!.stake).toBe(stake * 2);
      expect(state.blackjack!.you).toHaveLength(3);
      // And the hand is over whether the player likes it or not.
      expect(state.blackjack!.settled).toBe(true);
      return;
    }
    throw new Error('no seed produced a hand worth doubling');
  });

  it('keeps a cut, even from somebody playing it properly', () => {
    /*
     * Measured over three thousand hands rather than reasoned about. One hand
     * of blackjack has a standard deviation of about one whole stake, so a
     * three-hundred-hand sample lands anywhere between 88% and 104% and would
     * assert nothing at all — the earlier version of this test happened to draw
     * an 89.6% and looked like a finding.
     */
    let state = player('bj-edge');
    let staked = 0;
    let back = 0;

    for (let i = 0; i < 3_000; i++) {
      state.character.finances.savings = 1_000_000_00;
      state.character.finances.cash = 0;
      // The year's cap is the casino's rule, not this test's subject.
      delete state.flags.bets_this_year;
      state.history = state.history.slice(-2);
      state.currentYearEntryIds = [];
      state.seed = `bj-edge-${i}`;

      const played = playOut(state, 10_00);
      state = played.state;
      staked += played.staked;
      back += played.staked + played.net;
    }

    const rtp = back / staked;
    // The house wins. It is blackjack, so it wins slowly — this is the best
    // game on the floor and it still cannot be beaten by playing it well.
    expect(rtp).toBeLessThan(1);
    expect(rtp).toBeGreaterThan(0.93);
  });

  it('pays a natural three to two', () => {
    for (let i = 0; i < 400; i++) {
      const state = game.dealBlackjack(player(`bj-nat-${i}`), 10_00);
      const hand = state.blackjack!;
      if (hand.outcome !== 'Blackjack') continue;
      expect(hand.net).toBe(Math.round(10_00 * 1.5));
      return;
    }
    throw new Error('no seed dealt a natural in four hundred hands');
  });

  it('keeps the books, tonight and for a lifetime', () => {
    let state = player('bj-books');
    let expected = 0;
    for (let i = 0; i < 4; i++) {
      delete state.flags.bets_this_year;
      const played = playOut(state, 10_00);
      state = played.state;
      expected += played.net;
    }
    const view = game.blackjack(state);
    expect(view.sessionCents).toBe(expected);
    expect(view.lifetimeCents).toBe(expected);

    // A night is a night; what it cost you over a life is not forgotten.
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.ageUp(game.dismiss(state)).state;
    const next = game.blackjack(state);
    expect(next.sessionCents).toBe(0);
    expect(next.lifetimeCents).toBe(expected);
  });
});
