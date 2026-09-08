import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { livingAdult } from './fixtures.js';
import { moneyView } from '../views.js';
import { YEARLY_COST } from '../lottery.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * The lottery.
 *
 * The only gamble in the game with no decision inside it, and the only money
 * system that rewards nothing. It is here to be seen through rather than won,
 * so what these hold is that it loses, that it loses *visibly*, and that the
 * return the player actually experiences is close to the one the design claims
 * — a headline carried entirely by a jackpot nobody ever draws is not a
 * headline.
 */
const clear = (state: LifeState): LifeState => {
  let s = state;
  while (s.activeEvent) s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
  return game.dismiss(s);
};

/** Buys tickets every year from twenty-two, and reports what it came to. */
const aHabit = (seed: string, years: number) => {
  let s = livingAdult(game, seed, { toAge: 22, upbringing: 'comfortable' });
  let bought = 0;
  for (let i = 0; i < years && s.character.alive; i++) {
    s.character.finances.savings = Math.max(s.character.finances.savings, 1_000_000_00);
    s.character.record.incarceration = null;
    s = clear(s);
    try {
      s = game.act(s, 'lottery').state;
      bought += 1;
    } catch {
      /* in prison, or a child; not this test's subject */
    }
    s = clear(game.ageUp(s).state);
  }
  return {
    state: s,
    bought,
    spent: Number(s.flags.lottery_spent ?? 0),
    won: Number(s.flags.lottery_won ?? 0),
  };
};

describe('the lottery', () => {
  it('charges for the year and rolls fifty-two draws', () => {
    let s = livingAdult(game, 'lot-one', { toAge: 30, upbringing: 'comfortable' });
    s.character.finances.savings = 100_000_00;
    const before = s.character.finances.cash + s.character.finances.savings;

    const result = game.act(clear(s), 'lottery');
    s = result.state;
    expect(Number(s.flags.lottery_spent)).toBe(YEARLY_COST);
    expect(Number(s.flags.lottery_years)).toBe(1);

    const after = s.character.finances.cash + s.character.finances.savings;
    const won = Number(s.flags.lottery_won ?? 0);
    expect(after).toBe(before - YEARLY_COST + won);
    // It always says something, win or lose.
    expect(result.line).toMatch(/ticket|lottery/i);
  });

  it('is a loss, over a life, for very nearly everybody', () => {
    /*
     * Per life, not in aggregate. One jackpot is worth about as much as forty
     * lives of tickets, so summing the whole sample measures whether a jackpot
     * happened to land rather than whether the lottery loses — an earlier
     * version of this test asserted the total and failed the moment one did.
     */
    const nets: number[] = [];
    let ahead = 0;
    for (let i = 0; i < 40; i++) {
      const run = aHabit(`lot-life-${i}`, 45);
      if (run.bought < 20) continue;
      nets.push(run.won - run.spent);
      if (run.won > run.spent) ahead += 1;
    }

    expect(nets.length).toBeGreaterThan(20);
    nets.sort((a, b) => a - b);
    // The life in the middle is down, and comfortably.
    expect(nets[Math.floor(nets.length / 2)]!).toBeLessThan(0);
    // Somebody has to win it, but not many, and not most.
    expect(ahead).toBeLessThan(nets.length / 4);
  });

  it('pays back close to what it claims, without leaning on the jackpot', () => {
    /*
     * A first pass put nearly half the expected value in a jackpot at one in
     * seven hundred thousand: 66% on paper, 46% measured over two thousand
     * ticket-years, because not one landed. What the player experiences is the
     * only return that exists, so the tiers under the jackpot have to carry
     * most of it — this measures that, with the jackpot deliberately excluded.
     */
    let s = livingAdult(game, 'lot-rtp', { toAge: 30, upbringing: 'comfortable' });
    let spent = 0;
    let won = 0;

    for (let i = 0; i < 1_200; i++) {
      s.character.finances.savings = 10_000_000_00;
      s.character.finances.cash = 0;
      s.activityUsage = {};
      s.history = s.history.slice(-2);
      s.currentYearEntryIds = [];
      s.seed = `lot-rtp-${i}`;
      const before = Number(s.flags.lottery_won ?? 0);
      s = game.act(s, 'lottery').state;
      const gained = Number(s.flags.lottery_won ?? 0) - before;
      // The jackpot is a life event, not a rate; it would swamp the sample.
      if (gained >= 25_000_00) continue;
      spent += YEARLY_COST;
      won += gained;
    }

    const rtp = won / spent;
    expect(rtp).toBeLessThan(1);
    // Most of the stated 63% still arrives without a jackpot ever landing.
    expect(rtp).toBeGreaterThan(0.35);
  });

  it('tells the player what the habit cost, once there is a habit', () => {
    const early = aHabit('lot-note-a', 2);
    expect(moneyView(early.state, game.config, game.content).note ?? '').not.toMatch(/years of tickets/);

    for (let i = 0; i < 8; i++) {
      const run = aHabit(`lot-note-${i}`, 20);
      if (run.bought < 8) continue;
      const note = moneyView(run.state, game.config, game.content).note ?? '';
      if (!/years of tickets/.test(note)) continue;
      expect(note).toMatch(/\$[\d,]+ (down|up)/);
      return;
    }
    throw new Error('no life kept the habit long enough to be told about it');
  });
});
