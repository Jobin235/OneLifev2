import type { GameConfig } from '@lineage/config';
import type { WorldEvent, WorldIndicators, WorldSnapshot } from '@lineage/shared-types';
import { WORLD_SIGNAL_KEYS } from '@lineage/shared-types';

/**
 * The world engine (spec §86–87).
 *
 * It runs on its own clock and knows nothing about any individual player. That is
 * the whole scalability argument: one cheap global tick, and every player reads the
 * current state lazily when they age up.
 */
export const NEUTRAL_INDICATORS: WorldIndicators = {
  inflation: 100,
  interestRates: 100,
  employment: 100,
  housingCost: 100,
  fuel: 100,
  food: 100,
  wages: 100,
  businessConditions: 100,
  consumerSpending: 100,
  politicalTension: 100,
  publicHealth: 100,
  technologyPace: 100,
};

export interface TickInput {
  indicators: WorldIndicators;
  activeEvents: WorldEvent[];
  tick: number;
  config: GameConfig;
  /** Injected so the world tick is testable and reproducible. */
  random: () => number;
  /** Normalised external signals, when the ingestion layer has any (§91). */
  externalSignals?: Partial<Record<keyof WorldIndicators, number>>;
}

export interface TickResult {
  indicators: WorldIndicators;
  activeEvents: WorldEvent[];
}

export const tickWorld = (input: TickInput): TickResult => {
  const { config, random } = input;
  const next: WorldIndicators = { ...input.indicators };

  for (const key of WORLD_SIGNAL_KEYS) {
    const drift = (random() - 0.5) * 2 * config.world.driftPerTick;
    const reversion = (100 - next[key]) * config.world.meanReversion;
    next[key] = round2(next[key] + drift + reversion);
  }

  // Active world events push indicators for as long as they run.
  const stillActive: WorldEvent[] = [];
  for (const event of input.activeEvents) {
    if (event.endsTick !== null && input.tick >= event.endsTick) continue;
    for (const [key, pressure] of Object.entries(event.pressure)) {
      if (key in next) {
        next[key as keyof WorldIndicators] = round2(
          next[key as keyof WorldIndicators] + pressure * (event.severity / 100),
        );
      }
    }
    stillActive.push(event);
  }

  // External data is an enhancement, never a dependency (§91): if the ingestion
  // layer has nothing this tick, the internal walk simply continues.
  if (input.externalSignals) {
    for (const [key, target] of Object.entries(input.externalSignals)) {
      if (typeof target === 'number' && key in next) {
        const current = next[key as keyof WorldIndicators];
        next[key as keyof WorldIndicators] = round2(current + (target - current) * 0.15);
      }
    }
  }

  for (const key of WORLD_SIGNAL_KEYS) {
    next[key] = Math.max(20, Math.min(300, next[key]));
  }

  return { indicators: next, activeEvents: stillActive };
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const snapshot = (
  id: string,
  tick: number,
  indicators: WorldIndicators,
  activeEvents: WorldEvent[],
  capturedAt = new Date().toISOString(),
): WorldSnapshot => ({ id, tick, capturedAt, indicators, activeEvents });

/**
 * A year of the world.
 *
 * The tick above runs on the server's hourly clock: small steps, strong
 * reversion, tuned so the indicators a returning player sees have moved a
 * little. Run it once per game year and the world does not move at all — a
 * standing deviation of about one point against significance thresholds that
 * start at five — which is why the world engine ran for entire lives without
 * the player ever being told a single thing.
 *
 * This is the annual step, and it is a different animal: it can move a signal
 * far enough to matter, and once in a while it does something a random walk
 * would not. `anchor` is where the world is being pulled toward — the
 * authoritative global indicators when there is a server holding them, and
 * simply neutral when there is not.
 */
export const stepWorldYear = (
  indicators: WorldIndicators,
  anchor: WorldIndicators,
  config: GameConfig,
  random: () => number,
): WorldIndicators => {
  const { driftPerYear, reversionPerYear, shockChancePerYear } = config.world;
  const next: WorldIndicators = { ...indicators };

  for (const key of WORLD_SIGNAL_KEYS) {
    const drift = (random() - 0.5) * 2 * driftPerYear;
    const reversion = (anchor[key] - next[key]) * reversionPerYear;
    let value = next[key] + drift + reversion;

    /*
     * The years people remember. A walk gives you a decade of nothing much;
     * a crash, a boom and a bad winter are what make a life have a shape, and
     * they are the only way the "major" band is ever reached.
     */
    if (random() < shockChancePerYear) {
      const size = 12 + random() * 16;
      value += random() < 0.5 ? -size : size;
    }

    next[key] = round2(Math.max(20, Math.min(300, value)));
  }

  return next;
};
