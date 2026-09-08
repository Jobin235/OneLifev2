import type { GameConfig } from '@lineage/config';
import type { ContentPack, Interaction, InteractionResult } from '@lineage/content';
import type { LifeState, Relationship, RelationshipKind } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { checkInvariants, makeId, makeRng, refreshDerived, type Rng } from '@lineage/simulation';
import { pushHistory } from './ageup.js';

/**
 * Doing something to a specific person.
 *
 * The NPC model already carried memory and six relationship dimensions — deeper
 * than the single bar the genre usually offers — and none of it was reachable
 * from the UI. This is the surface for it.
 *
 * The point of difference is that an interaction is not a fixed delta. The same
 * "Talk" lands differently depending on where the relationship already is: warm
 * relationships mostly go well, cold ones mostly do not, and the line written
 * into the person's memory says which happened. That is what makes a
 * relationship feel like it has a state rather than a score.
 */

export class InteractionRejected extends Error {}

/** How well disposed this person currently is, 0..100. */
export const warmthOf = (rel: Relationship): number => {
  const d = rel.dimensions;
  const positive = (d.affection + d.trust + d.closeness + d.respect) / 4;
  return clampStat(positive - d.conflict / 2);
};

const matchesKind = (interaction: Interaction, kind: RelationshipKind): boolean => {
  if (interaction.excludeKinds.includes(kind)) return false;
  return interaction.kinds.includes('*') || interaction.kinds.includes(kind);
};

/** Why an interaction is unavailable, or null when it is fine. */
const blockedReason = (
  interaction: Interaction,
  state: LifeState,
  rel: Relationship,
  npcAlive: boolean,
): string | null => {
  if (!npcAlive) return 'They are gone';
  if (!matchesKind(interaction, rel.kind)) return null; // Not shown at all.
  const age = state.character.age;
  if (age < interaction.minAge) return 'You are too young';

  const used = state.interactionUsage[`${rel.npcId}:${interaction.id}`] ?? 0;
  if (interaction.timesPerYear > 0 && used >= interaction.timesPerYear) {
    return 'Not again this year';
  }

  const liquid = state.character.finances.cash + state.character.finances.savings;
  if (interaction.cost > liquid) return "You can't afford that";

  const warmth = warmthOf(rel);
  if (warmth < interaction.minWarmth) return 'You are not close enough for that';
  if (state.character.record.incarceration && !interaction.allowedInPrison) {
    return 'Not from in here';
  }
  return null;
};

/** What the player can do to this person right now. */
export const interactionsFor = (
  state: LifeState,
  npcId: string,
  content: ContentPack,
): Array<{
  id: string;
  icon: string;
  label: string;
  cost: number;
  timesLeft: number | null;
  available: boolean;
  blockedReason: string | null;
}> => {
  const rel = state.relationships.find((r) => r.npcId === npcId);
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!rel || !npc) return [];

  return content.interactions
    .filter((i) => matchesKind(i, rel.kind))
    .map((i) => {
      const reason = blockedReason(i, state, rel, npc.alive);
      const used = state.interactionUsage[`${npcId}:${i.id}`] ?? 0;
      return {
        id: i.id,
        icon: i.icon,
        label: i.label,
        cost: i.cost,
        timesLeft: i.timesPerYear > 0 ? Math.max(0, i.timesPerYear - used) : null,
        available: reason === null && state.character.alive && !state.activeEvent,
        /*
         * An open decision blocks everything, so it is said once at the screen
         * level rather than repeated on every tile — the same rule the Do
         * screen follows.
         */
        blockedReason: reason,
      };
    });
};

const applyResult = (
  result: InteractionResult,
  rel: Relationship,
  state: LifeState,
  npcName: string,
): string => {
  for (const [dimension, delta] of Object.entries(result.dimensions)) {
    const key = dimension as keyof Relationship['dimensions'];
    rel.dimensions[key] = clampStat(rel.dimensions[key] + delta);
  }
  for (const [stat, delta] of Object.entries(result.stats)) {
    const key = stat as keyof typeof state.character.stats;
    state.character.stats[key] = clampStat(state.character.stats[key] + delta);
  }
  if (result.money) state.character.finances.cash += result.money;

  return result.line.replaceAll('{them}', npcName);
};

export interface InteractResult {
  state: LifeState;
  /** Whether it landed well. The client uses this to colour the result. */
  warm: boolean;
  line: string;
  /**
   * The bar that moved, and where it moved from.
   *
   * Without this the result was a sentence and nothing else: the player tapped
   * "Talk", read "You had a good talk", and had no way to tell whether that was
   * worth doing again — the meters were on the screen behind the toast and
   * changed while it covered them. Showing the bar *in the result* is what makes
   * an interaction a move rather than a flavour text generator.
   *
   * One bar, not six: the dimension this interaction leaned on hardest.
   */
  meter: { label: string; from: number; to: number; good: boolean } | null;
}

/** How each dimension reads to somebody who is not looking at a data model. */
const DIMENSION_LABEL: Record<keyof Relationship['dimensions'], string> = {
  affection: 'Affection',
  trust: 'Trust',
  respect: 'Respect',
  conflict: 'Friction',
  closeness: 'Closeness',
  romance: 'Romance',
  dependence: 'Reliance',
};

/*
 * Which way is up, per dimension.
 *
 * Friction is the one that matters: everything else is better when it rises and
 * friction is worse, so a result that colours by direction alone congratulates
 * the player for an argument. It is reported when it is the biggest thing that
 * happened — "that landed badly" is worth saying — but it is never good news.
 */
const HIGHER_IS_BETTER: Record<keyof Relationship['dimensions'], boolean> = {
  affection: true,
  trust: true,
  respect: true,
  conflict: false,
  closeness: true,
  romance: true,
  dependence: true,
};

/** The one this interaction was really about: the largest move it made. */
const headlineDimension = (
  result: InteractionResult,
): keyof Relationship['dimensions'] | null => {
  let best: keyof Relationship['dimensions'] | null = null;
  let size = 0;
  for (const [dimension, delta] of Object.entries(result.dimensions)) {
    if (Math.abs(delta) <= size) continue;
    size = Math.abs(delta);
    best = dimension as keyof Relationship['dimensions'];
  }
  return best;
}

export const interact = (
  state: LifeState,
  npcId: string,
  interactionId: string,
  content: ContentPack,
  config: GameConfig,
): InteractResult => {
  const interaction = content.interactions.find((i) => i.id === interactionId);
  if (!interaction) throw new InteractionRejected(`unknown interaction ${interactionId}`);

  const rel = state.relationships.find((r) => r.npcId === npcId);
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!rel || !npc) throw new InteractionRejected('you do not know that person');
  if (!state.character.alive) throw new InteractionRejected('a dead character cannot do anything');
  if (state.activeEvent) throw new InteractionRejected('answer the open decision first');

  if (!matchesKind(interaction, rel.kind)) {
    throw new InteractionRejected('that is not something you can do with this person');
  }
  const reason = blockedReason(interaction, state, rel, npc.alive);
  if (reason) throw new InteractionRejected(reason);

  const before = structuredClone(state);
  const used = state.interactionUsage[`${npcId}:${interactionId}`] ?? 0;
  const rng: Rng = makeRng(state.seed, 'interact', npcId, interactionId, state.character.age, used);

  try {
    if (interaction.cost > 0) {
      state.character.finances.cash -= interaction.cost;
    }

    /*
     * Warmth decides how it goes, not a coin flip. A stranger you insult and a
     * spouse you insult are different acts, and the odds should say so.
     */
    const warmth = warmthOf(rel);
    const odds = Math.min(0.93, Math.max(0.07, interaction.baseWarmChance + warmth / 200));
    const warm = rng.chance(odds);
    const result = warm ? interaction.warm : interaction.cool;

    const headline = headlineDimension(result);
    const meterFrom = headline === null ? 0 : rel.dimensions[headline];

    const line = applyResult(result, rel, state, npc.firstName);

    rel.lastContactAge = state.character.age;
    rel.memories.push({
      id: makeId('mem', state.seed, npcId, interaction.id, state.step),
      atAge: state.character.age,
      factKey: `interaction:${interaction.id}`,
      line,
      weight: result.memoryWeight,
      data: {},
      resolved: false,
    });

    if (interaction.endsRelationship) {
      rel.formerKinds.push(rel.kind);
      rel.kind = 'acquaintance';
    }

    state.interactionUsage[`${npcId}:${interactionId}`] = used + 1;
    state.step += 1;
    pushHistory(state, 'relationship', interaction.icon, line, result.memoryWeight, [npcId]);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return {
      state,
      warm,
      line,
      meter:
        headline === null
          ? null
          : {
              label: `${npc.firstName}'s ${DIMENSION_LABEL[headline].toLowerCase()}`,
              from: Math.round(meterFrom),
              to: Math.round(rel.dimensions[headline]),
              good:
                rel.dimensions[headline] >= meterFrom
                  ? HIGHER_IS_BETTER[headline]
                  : !HIGHER_IS_BETTER[headline],
            },
    };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};
