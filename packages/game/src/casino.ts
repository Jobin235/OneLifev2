import type { GameConfig } from '@lineage/config';
import { clampStat, type LifeState } from '@lineage/shared-types';
import { checkInvariants, makeRng, pushHistory, refreshDerived, type Rng } from '@lineage/simulation';

/**
 * The casino.
 *
 * Eight games in BitLife's pack; four here, chosen because they are four
 * genuinely different decisions rather than four skins on the same one. The
 * rule underneath all of them is that the house wins: every payout below is
 * priced slightly under its true odds, and a player who keeps going long enough
 * loses, which is the only honest way to build one of these.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class CasinoRejected extends Error {}

/** Bets a year. Without a cap the correct play is to grind the variance. */
const BETS_A_YEAR = 6;

export const CASINO_GAMES = ['slots', 'roulette', 'blackjack', 'horses'] as const;
export type CasinoGame = (typeof CASINO_GAMES)[number];

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/* ------------------------------------------------------------------ *
 * The games
 * ------------------------------------------------------------------ */

const SYMBOLS = ['🍒', '🔔', '🍋', '⭐', '7️⃣'];

/**
 * Three wheels; three the same pays, two the same is a push.
 *
 * Priced at about 88% back, measured over eight thousand pulls rather than
 * reasoned about: the first pass paid four times for a line and returned 69%,
 * which is worse than any machine that has ever been allowed on a floor. Still
 * the worst bet in the room, which is what a slot machine is.
 */
const slots = (rng: Rng, stake: number) => {
  const reels = [rng.pick(SYMBOLS), rng.pick(SYMBOLS), rng.pick(SYMBOLS)];
  const three = reels[0] === reels[1] && reels[1] === reels[2];
  const two = !three && (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]);

  const won = three ? stake * (reels[0] === '7️⃣' ? 18 : 8) : two ? stake : 0;
  return {
    detail: reels.join(' '),
    won,
    line: three
      ? `Three ${reels[0]}. The machine made a noise and a man came over.`
      : two
        ? 'Two out of three, which gets you your money back and nothing else.'
        : 'Nothing. You watched it not happen three times.',
  };
};

/**
 * One bet on a number and its colour, on a thirty-seven pocket wheel.
 *
 * The number pays ten times and the colour alone pays one and a half, which
 * comes to about 96% back — the best straight odds in the room. The first pass
 * paid the colour double *and* the number ten times on the same stake, which
 * is two bets priced as one and returned 114%: a wheel that pays the player.
 */
const roulette = (rng: Rng, stake: number, pick: string) => {
  const number = rng.int(0, 36);
  const red = number !== 0 && number % 2 === 1;
  const colour = number === 0 ? 'green' : red ? 'red' : 'black';
  const [wantedColour, wantedNumberRaw] = pick.split(':');
  const wantedNumber = Number(wantedNumberRaw ?? -1);

  const exact = colour === wantedColour && number === wantedNumber;
  const near = !exact && colour === wantedColour;

  return {
    detail: `${number} ${colour}`,
    won: exact ? stake * 10 : near ? Math.round(stake * 1.5) : 0,
    line: exact
      ? `${number} ${colour}. Exactly what you said.`
      : near
        ? `${number} ${colour}. The colour, at least.`
        : `${number} ${colour}. Not that.`,
  };
};

/**
 * Two cards against a dealer who must draw to seventeen.
 *
 * The player picks a policy rather than a card, because one tap cannot be a
 * hand of blackjack: stick on the two you were dealt, take exactly one more, or
 * play it the way the book says and draw under seventeen. The book is worth
 * about 95% back and the other two are worth considerably less, which is the
 * whole reason a book exists.
 */
const blackjack = (rng: Rng, stake: number, policy: 'stick' | 'hit' | 'book') => {
  const card = () => Math.min(10, rng.int(1, 13));
  let you = card() + card();
  const dealt = you;

  if (policy === 'hit') you += card();
  else if (policy === 'book') while (you < 17) you += card();

  let dealer = card() + card();
  while (dealer < 17) dealer += card();

  const bust = you > 21;
  const dealerBust = dealer > 21;
  const won = bust
    ? 0
    : you === 21 && dealt === 21
      ? Math.round(stake * 2.5)
      : dealerBust || you > dealer
        ? stake * 2
        : you === dealer
          ? stake
          : 0;

  return {
    detail: `you ${you} · dealer ${dealer}`,
    won,
    line: bust
      ? `${you}. Bust, and the dealer did not have to do anything.`
      : dealt === 21
        ? 'Blackjack, off the deal.'
        : dealerBust
          ? `${you} against ${dealer}. The dealer went over.`
          : you > dealer
            ? `${you} against ${dealer}.`
            : you === dealer
              ? `${you} each. Nobody won anything.`
              : `${you} against ${dealer}. Not enough.`,
  };
};

const HORSES = [
  'Ravensworth',
  'The Long Field',
  'Quiet Sunday',
  'Bootmaker',
  'Half a Chance',
];

/**
 * Five horses, and a favourite that wins more often than the rest. Backing the
 * favourite pays badly and backing the outsider pays five to one, which is the
 * shape of every racecourse there has ever been.
 */
const horses = (rng: Rng, stake: number, pick: string) => {
  const index = Math.max(0, HORSES.indexOf(pick));
  // The field is not even: the first named is the favourite.
  const odds = [0.34, 0.25, 0.19, 0.13, 0.09];
  let roll = rng.next();
  let winner = 0;
  for (let i = 0; i < odds.length; i++) {
    if ((roll -= odds[i]!) <= 0) {
      winner = i;
      break;
    }
  }
  /*
   * Priced off the odds rather than picked: each pays about 88% of what the
   * horse is actually worth, which is what a bookmaker's margin looks like.
   * The first pass used round numbers and paid the favourite 68%.
   */
  const payout = [2.6, 3.5, 4.6, 6.8, 9.8];
  return {
    detail: `${HORSES[winner]} by ${['a nose', 'a length', 'three lengths', 'a distance'][rng.int(0, 3)]}`,
    won: winner === index ? Math.round(stake * payout[index]!) : 0,
    line:
      winner === index
        ? `${HORSES[winner]} came in. You had it.`
        : `${HORSES[winner]} came in. You did not have it.`,
  };
};

/* ------------------------------------------------------------------ *
 * Playing
 * ------------------------------------------------------------------ */

export interface CasinoResult {
  state: LifeState;
  /** "🍒 🔔 🍒", "17 black", "you 19 · dealer 20". */
  detail: string;
  line: string;
  /** Net of the stake. Negative on a loss. */
  net: number;
  netLabel: string;
}

/**
 * One bet.
 *
 * The stake leaves before the result is rolled, and the payout is the gross —
 * so a game that "pays back the stake" is a push and nets nothing. Getting that
 * the wrong way round is the easiest way to build a casino that prints money.
 */
export const play = (
  state: LifeState,
  game: CasinoGame,
  stake: number,
  pick: string,
  config: GameConfig,
): CasinoResult => {
  if (!state.character.alive) throw new CasinoRejected('a dead character cannot gamble');
  if (state.activeEvent) throw new CasinoRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new CasinoRejected('not from in here');
  if (state.character.age < 18) throw new CasinoRejected('they will not let you in');

  const purse = state.character.finances.cash + state.character.finances.savings;
  if (stake <= 0) throw new CasinoRejected('you have to bet something');
  if (stake > purse) throw new CasinoRejected('you cannot afford that');

  const bets = Number(state.flags.bets_this_year ?? 0);
  if (bets >= BETS_A_YEAR) throw new CasinoRejected('you have lost enough for one year');

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'casino', game, state.character.age, bets);
    state.flags.bets_this_year = bets + 1;
    state.step += 1;

    // The stake goes first, whatever happens next.
    const f = state.character.finances;
    const fromCash = Math.min(f.cash, stake);
    f.cash -= fromCash;
    f.savings -= stake - fromCash;

    const outcome =
      game === 'slots'
        ? slots(rng, stake)
        : game === 'roulette'
          ? roulette(rng, stake, pick)
          : game === 'blackjack'
            ? blackjack(rng, stake, pick === 'hit' ? 'hit' : pick === 'stick' ? 'stick' : 'book')
            : horses(rng, stake, pick);

    f.cash += outcome.won;
    const net = outcome.won - stake;

    /*
     * Winning is a good day and losing is a bad one, but neither is a
     * personality: the happiness swing is capped so a night at the tables
     * cannot be farmed as a mood.
     */
    state.character.stats.happiness = clampStat(
      state.character.stats.happiness + (net > 0 ? 4 : -3),
    );

    pushHistory(
      state,
      'money',
      net > 0 ? '🎉' : '🎰',
      `${outcome.line} ${net >= 0 ? `Up ${money(net)}.` : `Down ${money(-net)}.`}`,
      Math.abs(net) > purse / 4 ? 45 : 12,
    );

    refreshDerived(state, config);
    checkInvariants(state, before);
    return {
      state,
      detail: outcome.detail,
      line: outcome.line,
      net,
      netLabel: net >= 0 ? `+${money(net)}` : `−${money(-net)}`,
    };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export interface CasinoView {
  /** Why the whole floor is shut, or null. */
  locked: string | null;
  betsLeft: number;
  purse: string;
  purseCents: number;
  games: Array<{
    id: CasinoGame;
    emoji: string;
    label: string;
    note: string;
    /** What the player has to choose, when there is a choice. */
    picks: Array<{ id: string; label: string }>;
  }>;
}

export const casinoView = (state: LifeState): CasinoView => {
  const purse = state.character.finances.cash + state.character.finances.savings;
  const locked =
    !state.character.alive
      ? 'You are dead'
      : state.character.record.incarceration
        ? 'Not from in here'
        : state.character.age < 18
          ? 'They will not let you in'
          : null;

  return {
    locked,
    betsLeft: Math.max(0, BETS_A_YEAR - Number(state.flags.bets_this_year ?? 0)),
    purse: money(purse),
    purseCents: purse,
    games: [
      {
        id: 'slots',
        emoji: '🎰',
        label: 'Slots',
        note: 'Three wheels. Two the same gets your money back',
        picks: [],
      },
      {
        id: 'roulette',
        emoji: '🎡',
        label: 'Roulette',
        note: 'The colour gets you a bit back. The number pays ten times',
        picks: [
          { id: 'red:7', label: 'Red 7' },
          { id: 'red:23', label: 'Red 23' },
          { id: 'black:14', label: 'Black 14' },
          { id: 'black:30', label: 'Black 30' },
        ],
      },
      {
        id: 'blackjack',
        emoji: '🃏',
        label: 'Blackjack',
        note: 'Two cards against a dealer who has to draw to seventeen',
        picks: [
          { id: 'book', label: 'Play it properly' },
          { id: 'stick', label: 'Stick on two' },
          { id: 'hit', label: 'Take exactly one more' },
        ],
      },
      {
        id: 'horses',
        emoji: '🐎',
        label: 'The horses',
        note: 'Five of them. The favourite pays least',
        picks: HORSES.map((h, i) => ({
          id: h,
          label: `${h}${i === 0 ? ' (favourite)' : ''}`,
        })),
      },
    ],
  };
};

/** Cleared every birthday, so the cap is per year rather than per life. */
export const resetCasinoYear = (state: LifeState): void => {
  delete state.flags.bets_this_year;
};
