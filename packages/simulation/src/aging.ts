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
export const applyAgeDrift = (
  character: Character,
  config: GameConfig,
  rng: Rng,
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

  // Fitness always falls, so "Get in shape" has a job to do every year.
  stats.fitness = clampStat(stats.fitness - aging.fitnessDecayPerYear + rng.jitter() * 0.5);

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

  const target = clampStat(
    52 + stats.fitness * 0.45 - agePenalty - accelerated - conditionDrag - habitDrag,
  );
  stats.health = clampStat(stats.health + (target - stats.health) * 0.28 + rng.jitter());

  if (!ageless && age >= aging.smartsDeclineFromAge) {
    stats.smarts = clampStat(stats.smarts - aging.smartsDeclinePerYear);
  }

  if (!ageless && age > aging.charmPeakAge) {
    stats.charm = clampStat(stats.charm - aging.charmDeclinePerYear + rng.jitter() * 0.4);
  } else if (age < aging.charmPeakAge) {
    stats.charm = clampStat(stats.charm + 0.5);
  }

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
