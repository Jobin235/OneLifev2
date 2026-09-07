import type { GameConfig } from '@lineage/config';
import type {
  Effect,
  EventDefinition,
  EventInstance,
  HistoryEntry,
  LifeState,
} from '@lineage/shared-types';
import { makeId, makeRng } from '@lineage/simulation';
import { evaluate } from './conditions.js';
import type { ConditionContext } from './context.js';
import { applyEffects, type EffectContext } from './effects.js';
import { interpolate } from './text.js';

export class InvalidChoiceError extends Error {}

export interface ResolutionResult {
  instance: EventInstance;
  historyEntry: HistoryEntry;
  /** Effects the event engine could not apply alone; the game layer handles them. */
  deferred: Effect[];
  /**
   * The uninterpolated originals. Deferred effects run after resolution — they
   * are the ones that need content, and `child_born` is one of them — so a line
   * naming somebody the choice creates cannot be filled in yet. The caller
   * re-runs interpolation once those effects have landed.
   */
  templates: { outcomeText: string; historyLine: string };
}

/**
 * Resolving a choice is the moment the simulation decides what is true. The
 * narrative layer never gets to change any of this — it only rephrases it (§45).
 *
 * Rolls are seeded from the instance id, so replaying a life with the same choices
 * produces the same outcome branch every time (§125).
 */
export const resolveChoice = (
  instance: EventInstance,
  definition: EventDefinition,
  choiceId: string,
  state: LifeState,
  ctx: ConditionContext,
  config: GameConfig,
): ResolutionResult => {
  if (instance.chosenChoiceId !== null) {
    throw new InvalidChoiceError(`event ${instance.id} has already been resolved`);
  }

  const choice = definition.choices.find((c) => c.id === choiceId);
  if (!choice) throw new InvalidChoiceError(`unknown choice ${choiceId} on ${definition.id}`);

  const bindings = instance.participants;
  const probe: ConditionContext = { ...ctx, bindings };

  if (!evaluate(choice.requires, probe)) {
    throw new InvalidChoiceError(`choice ${choiceId} is not available`);
  }
  if (!instance.choices.some((c) => c.id === choiceId)) {
    throw new InvalidChoiceError(`choice ${choiceId} was not offered`);
  }

  const rng = makeRng(state.seed, 'resolve', instance.id, choiceId);

  const outcome =
    choice.outcomes.find((candidate) => {
      if (candidate.when && !evaluate(candidate.when, probe)) return false;
      if (candidate.chance !== undefined && !rng.chance(candidate.chance)) return false;
      return true;
    }) ?? choice.outcomes[choice.outcomes.length - 1]!;

  const effectCtx: EffectContext = { state, config, rng, bindings, deferred: [] };
  const deltas = applyEffects(outcome.effects, effectCtx);

  const outcomeText = interpolate(outcome.text, state, bindings);
  const historyLine = interpolate(outcome.historyLine, state, bindings);

  instance.chosenChoiceId = choiceId;
  instance.outcomeTitle = outcome.title
    ? interpolate(outcome.title, state, bindings)
    : instance.title;
  instance.outcomeText = outcomeText;
  instance.historyLine = historyLine;
  instance.deltas = deltas;

  const historyEntry: HistoryEntry = {
    id: makeId('his', state.seed, instance.id, 'resolved'),
    atAge: state.character.age,
    category: definition.category,
    icon: definition.card.icon,
    line: historyLine,
    significance: significanceOf(definition, outcome.effects),
    eventInstanceId: instance.id,
    npcIds: Object.values(bindings),
  };

  state.history.push(historyEntry);
  state.currentYearEntryIds.push(historyEntry.id);

  // Cooldown and variety bookkeeping (§20, §108).
  (state.eventLog[definition.id] ??= []).push(state.character.age);
  (state.categoryLog[definition.category] ??= []).push(state.character.age);

  // A scheduled event is spent once it fires.
  state.pending = state.pending.filter((p) => p.definitionId !== definition.id);

  state.step += 1;

  return {
    instance,
    historyEntry,
    deferred: effectCtx.deferred,
    /*
     * The uninterpolated originals. Deferred effects run after this function —
     * they are the ones that need content, and `child_born` is one of them — so
     * a line naming somebody the choice creates cannot be filled in yet. The
     * caller re-runs interpolation once the deferred effects have landed and
     * their bindings exist.
     */
    templates: { outcomeText: outcome.text, historyLine: outcome.historyLine },
  };
};

/**
 * How much this deserves to show up on the legacy screen decades later. Money and
 * life-shape changes outrank a mood swing; a marriage outranks a good day.
 */
const significanceOf = (definition: EventDefinition, effects: Effect[]): number => {
  let significance = definition.weightClass === 'major' ? 45 : 20;

  for (const effect of effects) {
    switch (effect.op) {
      case 'child_born':
      case 'convict':
        significance += 45;
        break;
      case 'relationship_kind':
        significance += effect.kind === 'spouse' || effect.kind === 'ex' ? 40 : 15;
        break;
      case 'business_start':
      case 'business_close':
      case 'career_join':
      case 'career_leave':
        significance += 25;
        break;
      case 'money':
        significance += Math.min(25, Math.abs(effect.delta) / 500_000);
        break;
      case 'condition_add':
        significance += 20;
        break;
      case 'move_city':
        significance += 20;
        break;
      default:
        break;
    }
  }
  return Math.max(0, Math.min(100, Math.round(significance)));
};
