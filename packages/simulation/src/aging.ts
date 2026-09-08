import type { GameConfig } from '@lineage/config';
import { lifeStageFor } from '@lineage/config';
import type { Character, LifeState } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import type { Rng } from './rng.js';

/**
 * The part of a year that happens to you whether or not anything interesting does.
 *
 * Deliberately gentle: this is background drift, and the player should feel their
 * decisions moving the numbers far more than time does. The one exception is
 * fitness, which always falls, so that "Get in shape" has a job to do every year.
 */
export interface DriftContext {
  /** 0..5, from no schooling to a postgraduate degree. */
  educationLevel: number;
  /** How much they have trained, studied and kept themselves up lately. */
  recentActivity: { fitness: number; study: number; charm: number };
  /** 0..1 — how much of their life has people in it who are glad they exist. */
  closeness: number;
  /** 0..1 — how far money has stopped being a thing they think about. */
  comfort: number;
}

export const applyAgeDrift = (
  character: Character,
  config: GameConfig,
  rng: Rng,
  context: DriftContext,
  /**
   * Whether time has stopped mattering to this body.
   *
   * A vampire keeps drifting toward what their life supports — a vampire who
   * never trains still gets soft — but the part of the target that is simply
   * being old is removed, which is the whole of what being one buys. What can
   * still end the life is elsewhere, and is a person with a stake.
   */
  ageless = false,
): void => {
  const { aging } = config;
  const { stats, age } = character;
  const educationCeiling = context.educationLevel;
  const recent = context.recentActivity;

  /*
   * Every drifting stat has a target it moves toward, not just health.
   *
   * Health had one and was the only stat with a believable curve. The other
   * three were one-way arithmetic, and measuring sixty lives showed what that
   * does: median fitness hit 0 at fifty-five and stayed there for forty years,
   * while smarts and charm pinned at 100 from twenty-five. Three of five stats
   * were dead — not varying, not decidable, just numbers that had finished.
   *
   * A target fixes it, because a target can be *reached*: a sedentary
   * fifty-year-old settles near thirty rather than sliding to nothing, and a
   * miserable, unhealthy seventy-year-old is not still at 95 charm.
   */

  /*
   * Fitness. The floor is being alive and moving about; training raises where
   * you settle, and age lowers it. `fitnessActivity` is topped up whenever the
   * character trains and bleeds away when they do not, so the target follows
   * what they have actually been doing rather than what they did once.
   */
  const trained = recent.fitness;
  const fitnessTarget = clampStat(
    46 + trained * 4.5 - Math.max(0, age - 30) * (ageless ? 0 : 0.62),
  );
  stats.fitness = clampStat(
    stats.fitness + (fitnessTarget - stats.fitness) * 0.3 - aging.fitnessDecayPerYear * 0.25 + rng.jitter() * 0.5,
  );

  /*
   * Health drifts toward what the character's life actually supports rather than
   * simply decaying. Without a target, every life spirals: a bad year lowers
   * health, low health invites conditions, conditions lower health further, and
   * nobody reaches sixty. With one, looking after yourself genuinely buys years
   * and neglecting yourself genuinely costs them.
   */
  const untreated = character.conditions.filter((c) => !c.treated);
  const conditionDrag = untreated.reduce((sum, c) => sum + c.annualHealthDrain * 4, 0);
  const habitDrag = character.habitIds.reduce(
    (sum, id) => sum + (HABIT_ANNUAL_COST[id]?.health ?? 0) * 4,
    0,
  );
  const agePenalty = ageless
    ? 0
    : Math.max(0, age - aging.healthDeclineFromAge) * aging.healthDeclinePerYear;
  const accelerated = ageless ? 0 : Math.max(0, age - 60) ** 2 * aging.healthDeclineAcceleration;

  /*
   * The base came down from 52 when fitness stopped flooring at zero: fitness
   * now sits in the twenties and forties for most of a life instead of at
   * nothing, and left alone that added nine points of health to everybody and
   * pushed the median age at death from seventy-five to eighty-three.
   */
  const target = clampStat(
    44 + stats.fitness * 0.45 - agePenalty - accelerated - conditionDrag - habitDrag,
  );
  stats.health = clampStat(stats.health + (target - stats.health) * 0.28 + rng.jitter());

  /*
   * Smarts. What you were taught is the ceiling you drift toward, so leaving
   * school at sixteen and reading three books does not get you to 100 — which
   * it did, for everybody, by twenty-five. Study pushes above the ceiling and
   * the drift pulls back to it, which is roughly how knowing things works.
   */
  const schooling = recent.study;
  const smartsTarget = clampStat(
    38 + educationCeiling * 11 + schooling * 5 - (ageless ? 0 : Math.max(0, age - aging.smartsDeclineFromAge) * 0.8),
  );
  stats.smarts = clampStat(stats.smarts + (smartsTarget - stats.smarts) * 0.22 + rng.jitter() * 0.4);

  /*
   * Charm. Not free, which it was: it climbed half a point a year to
   * twenty-seven and then fell too slowly for anything to catch it, so every
   * character in the game was at 95 forever. How you look and how you come
   * across follow how you feel and how well you are, which also gives the other
   * two stats somewhere to matter.
   */
  const charmTarget = clampStat(
    30 +
      stats.health * 0.3 +
      stats.happiness * 0.22 +
      recent.charm * 4 -
      (ageless ? 0 : Math.max(0, age - aging.charmPeakAge) * 0.35),
  );
  stats.charm = clampStat(stats.charm + (charmTarget - stats.charm) * 0.25 + rng.jitter() * 0.4);

  /*
   * Happiness. The last one-way stat, and the worst of them: sixty measured
   * lives had a median happiness of twelve at fifty-five. Everybody in the game
   * was miserable, the bar was permanently red, and a stat that is always at
   * the bottom tells the player nothing and gives them nothing to protect.
   *
   * People come back to a set point — that is the whole finding of the mood
   * research and it happens to be exactly what this needs. A win fades, so the
   * player has to keep playing for it; a terrible year is survivable, so a life
   * is never quietly over at thirty. And where the set point *sits* is made of
   * the two things the game is actually about: who is still in your life, and
   * whether money has stopped being a worry. Neither is free, and both are
   * losable, which is what makes protecting them a game.
   */
  const happinessTarget = clampStat(
    // Being a child is easier, and the set point should say so: rent, work and
    // what happens next are not yet anybody's problem.
    (age < 18 ? 40 : 24) + stats.health * 0.18 + context.closeness * 22 + context.comfort * 14,
  );
  stats.happiness = clampStat(
    stats.happiness + (happinessTarget - stats.happiness) * 0.26 + rng.jitter() * 0.6,
  );

  for (const habit of character.habitIds) {
    const cost = HABIT_ANNUAL_COST[habit];
    if (cost) {
      stats.happiness = clampStat(stats.happiness + cost.happiness);
      stats.fitness = clampStat(stats.fitness - cost.fitness);
    }
  }

  // Poor health drags mood down.
  if (stats.health < 40) stats.happiness = clampStat(stats.happiness - (40 - stats.health) * 0.15);
};

const HABIT_ANNUAL_COST: Record<string, { health: number; happiness: number; fitness: number }> = {
  smoking: { health: 2.2, happiness: 0.5, fitness: 1.4 },
  heavy_drinking: { health: 1.8, happiness: 0.3, fitness: 1.0 },
  overwork: { health: 1.2, happiness: -1.5, fitness: 0.8 },
  sedentary: { health: 0.6, happiness: 0, fitness: 1.6 },
  running: { health: -1.4, happiness: 0.8, fitness: -1.8 },
};

/**
 * Annual mortality. A Gompertz curve does the age work; health does the rest, so
 * a 60-year-old who looked after themselves genuinely outlives one who didn't.
 */
export const mortalityChance = (character: Character, config: GameConfig): number => {
  const { mortality } = config;
  if (character.age >= mortality.hardCapAge) return 1;

  const base = mortality.base * Math.exp(mortality.rate * (character.age - mortality.offset));

  const frailty =
    character.stats.health < mortality.frailHealthThreshold
      ? (mortality.frailHealthThreshold - character.stats.health) ** 1.5 * mortality.frailRiskPerPoint
      : 0;

  // Good health buys real time; the multiplier bottoms out at 0.5.
  const healthFactor = Math.max(0.5, 1.6 - character.stats.health / 100);

  return Math.min(1, base * healthFactor + frailty);
};

/** Convenience for the pipeline; keeps `lifeStageFor` out of caller imports. */
export const stageOf = (state: LifeState, config: GameConfig): string =>
  lifeStageFor(state.character.age, config);
