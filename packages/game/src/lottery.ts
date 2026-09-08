import { clampStat, type LifeState } from '@lineage/shared-types';
import { pushHistory, type Rng } from '@lineage/simulation';

/**
 * The lottery.
 *
 * The only gamble in the game with no decision inside it. You buy or you do
 * not, and then the year happens to you — which is exactly what a lottery is,
 * and is why it belongs next to the casino rather than in it.
 *
 * What makes it worth building is the number at the end. Every other money
 * system here rewards attention; this one is a slow, cheerful, entirely
 * voluntary leak, and the game keeps a running total of it so that a
 * seventy-year-old can be told what a ticket a week actually cost. That total
 * is the design: the lottery is here to be *seen through*, not to be won.
 *
 * A year at a time, not a ticket at a time. Fifty-two draws is how people
 * actually play it, it makes the annual decision the meaningful one, and it is
 * the only way the odds can be honest — a jackpot rare enough to deserve the
 * name would otherwise never land inside a single life.
 */

/** What a year of it costs: about three and a half a week, every week. */
export const TICKETS_A_YEAR = 52;
export const YEARLY_COST = 18_000;

interface Tier {
  /** One in this many draws. */
  odds: number;
  prize: number;
  label: string;
}

/*
 * About 63% back, which is kinder than any real lottery and deliberately so: a
 * real one returns roughly half and pays its jackpot once in three hundred
 * million tickets, so at fifty-two draws a year nobody would ever win anything
 * and the feature would be a button that removes money.
 *
 * How the return is *distributed* matters more than the number. A first pass
 * put nearly half the expected value in a jackpot at one in seven hundred
 * thousand — arithmetically 66% back, and measured over two thousand
 * ticket-years it returned 46%, because not one jackpot landed. A headline the
 * player can never experience is not a headline. So the jackpot is a quarter of
 * the value rather than a half, it lands in about one life in a hundred and
 * fifty, and the tiers underneath it carry enough that a life without one still
 * gets most of the stated return.
 */
const TIERS: Tier[] = [
  { odds: 450_000, prize: 25_000_000, label: 'jackpot' },
  { odds: 30_000, prize: 1_200_000, label: 'big' },
  { odds: 500, prize: 20_000, label: 'middling' },
  { odds: 12, prize: 1_000, label: 'small' },
];

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export interface LotteryYear {
  spent: number;
  won: number;
  /** The best thing that happened, for the line. */
  best: Tier | null;
  wins: number;
}

/**
 * A year of tickets, resolved.
 *
 * The cost is charged by the caller (it is the activity's price); this rolls
 * the draws and pays what comes up.
 */
export const drawYear = (state: LifeState, rng: Rng): LotteryYear => {
  let won = 0;
  let wins = 0;
  let best: Tier | null = null;

  for (let draw = 0; draw < TICKETS_A_YEAR; draw++) {
    for (const tier of TIERS) {
      if (!rng.chance(1 / tier.odds)) continue;
      won += tier.prize;
      wins += 1;
      if (!best || tier.prize > best.prize) best = tier;
      // One prize per ticket. The tiers are ordered best first.
      break;
    }
  }

  state.character.finances.cash += won;

  const spent = YEARLY_COST;
  state.flags.lottery_spent = Number(state.flags.lottery_spent ?? 0) + spent;
  state.flags.lottery_won = Number(state.flags.lottery_won ?? 0) + won;
  state.flags.lottery_years = Number(state.flags.lottery_years ?? 0) + 1;
  if (best?.label === 'jackpot') state.flags.lottery_jackpot = state.character.age;

  /*
   * The jackpot is a life event and everything else is a Tuesday. A middling
   * win is worth a small lift and a year of nothing is worth a shrug — a
   * fifty-two-week losing streak that cost real happiness would make the
   * lottery a trap rather than a habit.
   */
  const mood =
    best?.label === 'jackpot' ? 22 : best?.label === 'big' ? 8 : best?.label === 'middling' ? 2 : -1;
  state.character.stats.happiness = clampStat(state.character.stats.happiness + mood);

  pushHistory(
    state,
    'money',
    best?.label === 'jackpot' ? '🎊' : won > spent ? '🎟️' : '🎫',
    lineFor(best, won, spent, wins),
    best?.label === 'jackpot' ? 95 : best?.label === 'big' ? 55 : 8,
  );

  return { spent, won, best, wins };
};

const lineFor = (best: Tier | null, won: number, spent: number, wins: number): string => {
  if (best?.label === 'jackpot') {
    return `You won the lottery. ${money(best.prize)}, on a ticket you nearly did not buy.`;
  }
  if (best?.label === 'big') {
    return `One of your tickets came up. ${money(best.prize)}, and nobody at work found out.`;
  }
  if (won > spent) {
    return `A year of tickets, and for once you came out ahead — ${money(won - spent)} up.`;
  }
  if (wins > 0) {
    return `A year of tickets. ${wins === 1 ? 'One' : `${wins} of them`} paid something, and none of it was enough.`;
  }
  return 'A year of lottery tickets. Not one of them was worth anything.';
};

/** What the habit has cost, for anybody who wants to look. */
export const lotteryLine = (state: LifeState): string | null => {
  const years = Number(state.flags.lottery_years ?? 0);
  if (years === 0) return null;
  const spent = Number(state.flags.lottery_spent ?? 0);
  const won = Number(state.flags.lottery_won ?? 0);
  const net = won - spent;
  if (net > 0) return `${years} years of tickets, ${money(net)} up. Do not get used to it.`;
  return `${years} ${years === 1 ? 'year' : 'years'} of tickets, ${money(-net)} down.`;
};
