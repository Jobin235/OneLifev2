import type { LifeState, ParticipantSelector, Relationship } from '@lineage/shared-types';
import { surfacedScore, type Rng } from '@lineage/simulation';
import { evaluate } from './conditions.js';
import type { ConditionContext } from './context.js';

/**
 * Binds an event's declared roles to actual people.
 *
 * Returns null when a required role has nobody to fill it — that is how "your
 * partner asks about kids" simply never surfaces for someone who is single,
 * without the content having to say so.
 */
export const bindParticipants = (
  selectors: ParticipantSelector[],
  state: LifeState,
  ctx: ConditionContext,
  rng: Rng,
): Record<string, string> | null => {
  const bindings: Record<string, string> = {};
  const taken = new Set<string>();

  for (const selector of selectors) {
    const kinds = new Set(selector.kinds);
    const candidates = state.relationships.filter((rel) => {
      if (taken.has(rel.npcId)) return false;
      if (kinds.size > 0 && !kinds.has(rel.kind)) return false;
      const npc = state.npcs.find((n) => n.id === rel.npcId);
      if (!npc || !npc.alive) return false;
      if (selector.where) {
        // Evaluate the filter with this candidate temporarily bound to the role.
        const probe: ConditionContext = {
          ...ctx,
          bindings: { ...bindings, [selector.role]: rel.npcId },
        };
        if (!evaluate(selector.where, probe)) return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      if (selector.required) return null;
      continue;
    }

    const chosen = rank(candidates, selector.pick, state, rng);
    bindings[selector.role] = chosen.npcId;
    taken.add(chosen.npcId);
  }

  return bindings;
};

const rank = (
  candidates: Relationship[],
  pick: ParticipantSelector['pick'],
  state: LifeState,
  rng: Rng,
): Relationship => {
  const ageOf = (rel: Relationship) => state.npcs.find((n) => n.id === rel.npcId)?.age ?? 0;

  switch (pick) {
    case 'closest':
      return [...candidates].sort((a, b) => surfacedScore(b) - surfacedScore(a))[0]!;
    case 'most_conflict':
      return [...candidates].sort((a, b) => b.dimensions.conflict - a.dimensions.conflict)[0]!;
    case 'oldest':
      return [...candidates].sort((a, b) => ageOf(b) - ageOf(a))[0]!;
    case 'youngest':
      return [...candidates].sort((a, b) => ageOf(a) - ageOf(b))[0]!;
    case 'random':
    default:
      return rng.pick(candidates);
  }
};
