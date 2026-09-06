import type { GameConfig } from '@lineage/config';
import type { LifeState, WorldDelta, WorldIndicators, WorldSnapshot } from '@lineage/shared-types';
import { WORLD_SIGNAL_KEYS } from '@lineage/shared-types';

/**
 * The return-diff engine (spec §89–90).
 *
 * Design 1C is the acceptance test for this whole subsystem: the player must never
 * be able to tell a world event from a personal one, and "a 19-year-old student:
 * nothing happens at all" has to be the common case.
 */
export const diffSnapshots = (
  previous: WorldIndicators,
  current: WorldIndicators,
  config: GameConfig,
): WorldDelta[] => {
  const { significance } = config.world;

  return WORLD_SIGNAL_KEYS.map((signal) => {
    const from = previous[signal];
    const to = current[signal];
    const pctChange = from === 0 ? 0 : (to - from) / from;
    const magnitude = Math.abs(pctChange);

    const level: WorldDelta['significance'] =
      magnitude >= significance.major
        ? 'major'
        : magnitude >= significance.meaningful
          ? 'meaningful'
          : magnitude >= significance.minor
            ? 'minor'
            : 'ignore';

    return { signal, from, to, pctChange, significance: level };
  }).filter((delta) => delta.significance !== 'ignore');
};

/**
 * How much a given change actually matters to *this* life. A fuel spike is a major
 * event for a haulier, a rounding error for a student.
 */
export const relevanceToPlayer = (delta: WorldDelta, state: LifeState): number => {
  let relevance = 0;

  for (const business of state.businesses) {
    if (business.closed) continue;
    if (business.exposures.includes(delta.signal)) relevance += 70;
  }

  switch (delta.signal) {
    case 'housingCost':
      if (state.assets.some((a) => a.kind === 'house' || a.kind === 'apartment')) relevance += 45;
      else if (state.character.age >= 22) relevance += 15;
      break;
    case 'employment':
      if (state.career.current) relevance += 35;
      break;
    case 'interestRates':
      if (state.character.finances.debt > 0) relevance += 40;
      break;
    case 'food':
    case 'inflation':
      relevance += state.character.finances.cash < 500_000 ? 30 : 10;
      break;
    case 'publicHealth':
      if (state.character.conditions.length > 0 || state.character.age > 65) relevance += 30;
      break;
    case 'politicalTension':
      if (state.flags.in_politics) relevance += 45;
      break;
    default:
      break;
  }

  const weight = delta.significance === 'major' ? 1.4 : delta.significance === 'meaningful' ? 1 : 0.5;
  return Math.round(relevance * weight);
};

export interface ReturnEventDecision {
  fire: boolean;
  delta: WorldDelta | null;
  relevance: number;
  reason: string;
}

/**
 * Spec §9: most logins must NOT produce a special event, or players farm the
 * mechanic by closing and reopening the app. Cooldown, threshold and a dice roll
 * all have to agree before anything happens.
 */
export const decideReturnEvent = (
  state: LifeState,
  previous: WorldSnapshot | null,
  current: WorldSnapshot,
  config: GameConfig,
  now: Date,
  random: () => number,
): ReturnEventDecision => {
  const none = (reason: string): ReturnEventDecision => ({ fire: false, delta: null, relevance: 0, reason });

  if (!previous) return none('no previous snapshot');
  if (previous.id === current.id) return none('world has not moved');

  if (state.lastReturnEventAt) {
    const hoursSince = (now.getTime() - new Date(state.lastReturnEventAt).getTime()) / 3_600_000;
    if (hoursSince < config.world.returnEventCooldownHours) return none('within cooldown');
  }

  const deltas = diffSnapshots(previous.indicators, current.indicators, config);
  if (deltas.length === 0) return none('nothing changed enough');

  const scored = deltas
    .map((delta) => ({ delta, relevance: relevanceToPlayer(delta, state) }))
    .filter((row) => row.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);

  const best = scored[0];
  if (!best) return none('nothing relevant to this life');
  if (best.relevance < 40) return none('below relevance threshold');

  // Even a highly relevant change usually stays background.
  if (random() > config.world.returnEventChance) return none('roll failed');

  return { fire: true, delta: best.delta, relevance: best.relevance, reason: 'relevant and rolled' };
};
