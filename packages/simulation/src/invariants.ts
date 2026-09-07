import type { LifeState } from '@lineage/shared-types';
import { STAT_MAX, STAT_MIN } from '@lineage/shared-types';

/**
 * Spec §124. These are checked after every simulation transaction in development
 * and in tests; a violation means the transaction is rejected and rolled back
 * rather than persisted, because a corrupted life is worse than a failed request.
 */
export class InvariantViolation extends Error {
  constructor(public readonly invariant: string, message: string) {
    super(`${invariant}: ${message}`);
    this.name = 'InvariantViolation';
  }
}

export const checkInvariants = (state: LifeState, previous?: LifeState): void => {
  const { character } = state;
  const fail = (name: string, message: string) => {
    throw new InvariantViolation(name, message);
  };

  if (character.age < 0) fail('age_non_negative', `age is ${character.age}`);
  if (previous && character.age < previous.character.age) {
    fail('age_never_decreases', `${previous.character.age} → ${character.age}`);
  }

  for (const [key, value] of Object.entries(character.stats)) {
    if (!Number.isFinite(value)) fail('stats_finite', `${key} is ${value}`);
    if (value < STAT_MIN || value > STAT_MAX) fail('stats_in_range', `${key} is ${value}`);
    if (!Number.isInteger(value)) fail('stats_integral', `${key} is ${value}`);
  }

  for (const [key, value] of Object.entries(character.finances)) {
    if (!Number.isFinite(value)) fail('money_finite', `${key} is ${value}`);
    if (!Number.isInteger(value)) fail('money_integral', `${key} is ${value}`);
  }
  if (character.finances.debt < 0) fail('debt_non_negative', `${character.finances.debt}`);

  if (!character.alive && character.deathAge === null) {
    fail('dead_has_death_age', 'character is dead with no death age');
  }
  if (character.alive && character.deathAge !== null) {
    fail('alive_xor_dead', 'character is alive but has a death age');
  }
  if (!character.alive && state.gameState !== 'LIFE_COMPLETE') {
    fail('dead_life_is_complete', `gameState is ${state.gameState}`);
  }
  if (!character.alive && state.activeEvent) {
    fail('dead_take_no_actions', 'a dead character has an active event');
  }

  const fame = character.fame;
  if (fame.fans + fame.indifferent + fame.haters !== 100) {
    fail('fame_shares_sum_to_100', `${fame.fans}/${fame.indifferent}/${fame.haters}`);
  }

  for (const rel of state.relationships) {
    for (const [key, value] of Object.entries(rel.dimensions)) {
      if (value < STAT_MIN || value > STAT_MAX) {
        fail('relationship_dimensions_in_range', `${rel.npcId}.${key} is ${value}`);
      }
    }
    if (!state.npcs.some((n) => n.id === rel.npcId)) {
      fail('relationship_has_npc', `no npc ${rel.npcId}`);
    }
  }

  const npcIds = new Set<string>();
  for (const npc of state.npcs) {
    if (npcIds.has(npc.id)) fail('npc_ids_unique', `duplicate ${npc.id}`);
    npcIds.add(npc.id);
  }

  for (const [activityId, used] of Object.entries(state.activityUsage)) {
    if (!Number.isInteger(used) || used < 0) {
      fail('activity_usage_is_a_count', `${activityId} is ${used}`);
    }
  }

  if (state.career.retired && state.career.current) {
    fail('retired_has_no_job', `retired but employed as ${state.career.current.title}`);
  }

  if (character.record.incarceration && state.career.current) {
    fail('incarcerated_has_no_job', 'incarcerated but employed');
  }

  const historyIds = new Set<string>();
  for (const entry of state.history) {
    if (historyIds.has(entry.id)) fail('history_ids_unique', `duplicate ${entry.id}`);
    historyIds.add(entry.id);
    if (entry.atAge > character.age) {
      fail('history_not_in_future', `entry at ${entry.atAge}, age ${character.age}`);
    }
  }
};
