import type { GameConfig } from '@lineage/config';
import type { LifeState, WorldDelta, WorldIndicators } from '@lineage/shared-types';
import { pushHistory } from '@lineage/simulation';
import type { Rng } from '@lineage/simulation';
import { diffSnapshots, relevanceToPlayer, stepWorldYear, NEUTRAL_INDICATORS } from '@lineage/world';

/**
 * The world, said out loud.
 *
 * The world engine has always run — indicators drifting, events pushing on
 * them, businesses reading their exposures — and the player has never once been
 * told. It was a system with no output: rent went up and the only evidence was
 * a bigger number on the Money screen.
 *
 * This is the output. Not a second feed and not a ticker: one line, in the same
 * log as everything else, when something moved far enough to notice *and* it
 * has some bearing on this particular life. A nineteen-year-old student hears
 * nothing about interest rates, which is design 1C's acceptance test and also
 * simply true.
 */

/** How a signal reads when it rises, and when it falls. */
interface Voice {
  /** The all-caps strip word, so the log can be scanned. */
  up: string[];
  down: string[];
}

const VOICE: Record<keyof WorldIndicators, Voice> = {
  inflation: {
    up: [
      'The price of everything went up this year, and nobody could say quite why.',
      'A weekly shop cost noticeably more than it had the year before.',
    ],
    down: ['Prices steadied for the first time in a while.'],
  },
  interestRates: {
    up: [
      'The central bank raised rates again. Anybody carrying debt felt it.',
      'Borrowing got expensive, and the people who had borrowed found out first.',
    ],
    down: ['Rates came down, and the payments got easier.'],
  },
  employment: {
    up: ['Everybody seemed to be hiring.', 'It was a good year to be looking for work.'],
    down: [
      'The layoffs started in the spring and did not really stop.',
      'Work got harder to find, and harder to keep.',
    ],
  },
  housingCost: {
    up: [
      'House prices ran away from wages again.',
      'Rents went up across the city and the arguments about why went nowhere.',
    ],
    down: ['The housing market went quiet, and prices came off.'],
  },
  fuel: {
    up: ['Fuel got expensive. Everything that has to be moved got expensive with it.'],
    down: ['Fuel got cheap, briefly, and everybody drove further.'],
  },
  food: {
    up: ['A bad harvest somewhere else made the food here cost more.'],
    down: ['Food got cheaper, which surprised everyone who had been paying attention.'],
  },
  wages: {
    up: ['Wages moved for once, and people started asking for more.'],
    down: ['Pay stopped keeping up, and everybody noticed at the same time.'],
  },
  businessConditions: {
    up: ['It was a good year to be running something.'],
    down: ['Small businesses closed all over town.'],
  },
  consumerSpending: {
    up: ['People were spending again. The high street looked almost busy.'],
    down: ['People stopped spending, and the shops felt it first.'],
  },
  politicalTension: {
    up: [
      'The politics got loud this year, and then it got personal.',
      'There were marches, and then counter-marches, and nobody changed their mind.',
    ],
    down: ['The shouting died down. Nobody trusted it to last.'],
  },
  publicHealth: {
    up: ['A good year for the hospitals, for a change.'],
    down: [
      'Something was going round all winter, and the hospitals filled up.',
      'The waiting lists got long enough to make the news.',
    ],
  },
  technologyPace: {
    up: ['Everything got a little bit newer and a little bit harder to understand.'],
    down: ['The next big thing turned out not to be one.'],
  },
};

/**
 * Which way "up" is *for a person*.
 *
 * Employment rising is good news and inflation rising is not, and the log has
 * to know the difference or every line reads as neutral weather.
 */
const GOOD_WHEN_UP: Record<keyof WorldIndicators, boolean> = {
  inflation: false,
  interestRates: false,
  employment: true,
  housingCost: false,
  fuel: false,
  food: false,
  wages: true,
  businessConditions: true,
  consumerSpending: true,
  politicalTension: false,
  publicHealth: true,
  technologyPace: true,
};

const ICON: Record<keyof WorldIndicators, string> = {
  inflation: '📈',
  interestRates: '🏦',
  employment: '💼',
  housingCost: '🏠',
  fuel: '⛽',
  food: '🥫',
  wages: '💷',
  businessConditions: '🏭',
  consumerSpending: '🛍️',
  politicalTension: '🪧',
  publicHealth: '🏥',
  technologyPace: '🛰️',
};

/**
 * Moves the life's copy of the world on by a year and says what changed.
 *
 * `authoritative` is the server's world when there is a server. Without one the
 * life walks its own, seeded off the life so the same seed gives the same
 * decade — which is the only way the offline build can be replayed at all.
 */
export const advanceWorldYear = (
  state: LifeState,
  authoritative: WorldIndicators,
  config: GameConfig,
  rng: Rng,
): WorldIndicators => {
  const previous = state.world?.indicators ?? NEUTRAL_INDICATORS;
  const tick = (state.world?.tick ?? 0) + 1;

  /*
   * A caller that has a real world hands one over and this defers to it. The
   * default the game exposes is the neutral one, and deferring to *that* would
   * mean a world permanently frozen at 100 — which is exactly what was
   * happening, and why none of this had ever produced a line.
   */
  /*
   * One world, when there is one. A server holding the global indicators is the
   * authority and this takes them exactly — every life in that world reads the
   * same numbers, which is the entire point of having a world at all. What the
   * life stores is only the copy the *last* year was measured against, so this
   * year can say what changed.
   *
   * Without a server there is nothing to be authoritative, and the default the
   * game exposes is the neutral world — deferring to that would mean a world
   * frozen at 100 for eighty years, which is what was happening. So the life
   * walks its own instead, seeded off the life, and the same seed gives the
   * same decade.
   */
  const givenIsReal = WORLD_KEYS.some((key) => authoritative[key] !== NEUTRAL_INDICATORS[key]);
  const indicators = givenIsReal
    ? authoritative
    : stepWorldYear(state.world ? previous : NEUTRAL_INDICATORS, NEUTRAL_INDICATORS, config, () =>
        rng.next(),
      );

  state.world = { indicators, tick };
  reportWorldYear(state, previous, indicators, config, rng);
  return indicators;
};

const WORLD_KEYS = Object.keys(NEUTRAL_INDICATORS) as (keyof WorldIndicators)[];

/**
 * The world this life is being lived in, for everything that reads one.
 *
 * The market, the businesses and the event conditions all take a world, and
 * every one of them defaulted to the neutral one — so a caller without a server
 * had share prices and world-gated content behaving as though nothing anywhere
 * had ever changed, even while the life's own world was three years into a
 * downturn. Given a real world, that wins; otherwise it is the one the life has
 * been walking.
 */
export const worldFor = (state: LifeState, given: WorldIndicators): WorldIndicators => {
  const givenIsReal = WORLD_KEYS.some((key) => given[key] !== NEUTRAL_INDICATORS[key]);
  if (givenIsReal) return given;
  return state.world?.indicators ?? NEUTRAL_INDICATORS;
};

/**
 * At most one headline a year, and only one that means something here.
 *
 * The cap is the point. Twelve indicators drifting will always give you
 * something to say, and a log that says all of it every year is a newspaper the
 * player learns to skip — which costs more than saying nothing would.
 */
const reportWorldYear = (
  state: LifeState,
  previous: WorldIndicators,
  current: WorldIndicators,
  config: GameConfig,
  rng: Rng,
): void => {
  const deltas = diffSnapshots(previous, current, config);
  if (deltas.length === 0) return;

  const best = deltas
    .map((delta) => ({ delta, relevance: relevanceToPlayer(delta, state) }))
    .filter((row) => row.relevance >= 30)
    .sort((a, b) => b.relevance - a.relevance)[0];
  if (!best) return;

  // Even a relevant change is usually just the background of a year.
  if (!rng.chance(best.delta.significance === 'major' ? 0.85 : 0.4)) return;

  /*
   * Not the same news twice in a decade.
   *
   * A signal that has drifted out of band tends to stay there, so without this
   * the log tells you wages have stopped keeping up in three years out of five
   * and the line stops carrying any weight at all — which is the same failure
   * as saying nothing, arrived at from the other direction.
   */
  const line = lineFor(best.delta, rng);
  const recent = state.history.filter((h) => state.character.age - h.atAge <= 10);
  if (recent.some((h) => h.line === line)) return;
  if (recent.some((h) => state.character.age - h.atAge <= 4 && h.category === 'world')) return;

  pushHistory(
    state,
    'world',
    ICON[best.delta.signal as keyof WorldIndicators],
    line,
    best.delta.significance === 'major' ? 30 : 18,
  );
};

const lineFor = (delta: WorldDelta, rng: Rng): string => {
  const voice = VOICE[delta.signal as keyof WorldIndicators];
  const lines = delta.pctChange > 0 ? voice.up : voice.down;
  return lines[rng.int(0, lines.length - 1)] ?? lines[0]!;
};

/** Whether this year's world is, on balance, doing the player a favour. */
export const worldMood = (delta: WorldDelta): 'good' | 'bad' =>
  (delta.pctChange > 0) === GOOD_WHEN_UP[delta.signal as keyof WorldIndicators] ? 'good' : 'bad';
