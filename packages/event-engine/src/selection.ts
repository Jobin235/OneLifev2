import type { GameConfig } from '@lineage/config';
import type {
  EventDefinition,
  EventInstance,
  LifeState,
  ScheduledEvent,
  TraitDefinition,
} from '@lineage/shared-types';
import { makeId, relationshipLabel, type Rng } from '@lineage/simulation';
import { evaluate } from './conditions.js';
import type { ConditionContext } from './context.js';
import { bindParticipants } from './participants.js';
import { interpolate } from './text.js';

export interface Candidate {
  definition: EventDefinition;
  bindings: Record<string, string>;
  score: number;
  /** Set when this candidate came from the pending queue. */
  scheduled: ScheduledEvent | null;
}

export interface SelectionResult {
  major: Candidate | null;
  minor: Candidate[];
  /** Everything that was considered, for the admin/debug view (§119). */
  considered: number;
}

/**
 * Spec §107: filter a large pool down to a shortlist, score it, then pick a very
 * small number. The player gets 0–1 major and 0–2 minor events, never fifteen.
 */
export const selectEvents = (
  definitions: EventDefinition[],
  state: LifeState,
  ctx: ConditionContext,
  config: GameConfig,
  traits: Map<string, TraitDefinition>,
  rng: Rng,
): SelectionResult => {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const candidates: Candidate[] = [];

  // Scheduled follow-ups come first and bypass cooldowns — an event chain that
  // said "we'll come back to this in two years" has to keep its promise (§104).
  const due = state.pending.filter((p) => p.dueAtAge <= state.character.age);
  for (const scheduled of due) {
    const definition = byId.get(scheduled.definitionId);
    if (!definition) continue;
    const probe: ConditionContext = { ...ctx, bindings: scheduled.participants };
    if (!passesGates(definition, state, probe, { ignoreCooldown: true })) continue;

    const bindings =
      Object.keys(scheduled.participants).length > 0
        ? scheduled.participants
        : bindParticipants(definition.participants, state, probe, rng);
    if (bindings === null) continue;

    candidates.push({
      definition,
      bindings,
      score: 1000 + (scheduled.priorityOverride ?? definition.priority),
      scheduled,
    });
  }

  for (const definition of definitions) {
    if (definition.scheduledOnly) continue;
    if (candidates.some((c) => c.definition.id === definition.id)) continue;
    if (!passesGates(definition, state, ctx, { ignoreCooldown: false })) continue;

    const bindings = bindParticipants(definition.participants, state, ctx, rng);
    if (bindings === null) continue;

    const probe: ConditionContext = { ...ctx, bindings };
    if (!evaluate(definition.conditions, probe)) continue;

    candidates.push({
      definition,
      bindings,
      score: scoreCandidate(definition, state, config, traits, rng),
      scheduled: null,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const shortlist = candidates.slice(0, config.events.shortlistSize);

  const majors = shortlist.filter((c) => c.definition.weightClass === 'major');
  const minors = shortlist.filter((c) => c.definition.weightClass === 'minor');

  // Some years are deliberately quiet, unless something was scheduled for this one.
  const forced = majors.some((c) => c.scheduled !== null);
  const quiet = !forced && rng.chance(config.events.quietYearChance);

  const major = quiet || majors.length === 0
    ? null
    : rng.weighted(majors.slice(0, 5), (c) => Math.max(1, c.score));

  const minorPool = minors.filter((c) => c.definition.id !== major?.definition.id);
  const minorCount = Math.min(config.events.maxMinorPerYear, minorPool.length, rng.int(0, 2));
  const chosenMinor = rng.shuffle(minorPool).slice(0, minorCount);

  return { major, minor: chosenMinor, considered: candidates.length };
};

const passesGates = (
  definition: EventDefinition,
  state: LifeState,
  ctx: ConditionContext,
  opts: { ignoreCooldown: boolean },
): boolean => {
  const age = state.character.age;
  if (age < definition.minAge || age > definition.maxAge) return false;

  if (definition.countryIds.length > 0 && !definition.countryIds.includes(state.character.countryId)) {
    return false;
  }

  const fired = state.eventLog[definition.id] ?? [];
  if (fired.length >= definition.maxPerLife) return false;
  if (!opts.ignoreCooldown) {
    const last = fired[fired.length - 1];
    if (last !== undefined && age - last < definition.cooldownYears) return false;
  }

  // Prison and death close off almost everything else.
  if (state.character.record.incarceration) {
    const allowed = definition.category === 'prison' || definition.tags.includes('while_inside');
    if (!allowed) return false;
  }
  if (!state.character.alive) return false;

  return evaluate(definition.conditions, ctx);
};

/**
 * Spec §19: relevance + urgency + significance + player history + randomness,
 * with the repetition penalty from §108 keeping a life from becoming all career.
 */
const scoreCandidate = (
  definition: EventDefinition,
  state: LifeState,
  config: GameConfig,
  traits: Map<string, TraitDefinition>,
  rng: Rng,
): number => {
  let score = definition.priority;

  const recent = state.categoryLog[definition.category] ?? [];
  const inWindow = recent.filter(
    (age) => state.character.age - age <= config.events.categoryRepeatWindowYears,
  ).length;
  if (inWindow > 0) score *= Math.pow(config.events.categoryRepeatPenalty, inWindow);

  // A character's traits pull their life toward certain kinds of trouble (§142).
  for (const traitId of state.character.traitIds) {
    const affinity = traits.get(traitId)?.eventAffinity[definition.category];
    if (affinity) score *= affinity;
  }


  // Never seen it: nudge it up, so a life reaches for its unused content.
  if (!state.eventLog[definition.id]) score *= 1.25;

  return score * (0.7 + rng.next() * 0.6);
};

/** Turns a chosen candidate into the card the player actually reads. */
export const instantiate = (
  candidate: Candidate,
  state: LifeState,
  ctx: ConditionContext,
): EventInstance => {
  const { definition, bindings } = candidate;
  const probe: ConditionContext = { ...ctx, bindings };

  const choices = definition.choices
    .filter((choice) => evaluate(choice.requires, probe))
    .map((choice) => ({
      id: choice.id,
      label: interpolate(choice.label, state, bindings),
      ...(choice.note ? { note: interpolate(choice.note, state, bindings) } : {}),
      ...(choice.confirm ? { confirm: interpolate(choice.confirm, state, bindings) } : {}),
      ...(choice.price ? { price: interpolate(choice.price, state, bindings) } : {}),
      ...(choice.quality !== undefined ? { quality: choice.quality } : {}),
    }));

  /*
   * If the event is about somebody, the popup names them and says who they are
   * to the player. BitLife restates the relation on every single card, and that
   * is what lets a life carry forty NPCs without a directory screen.
   */
  const subjectId = bindings[definition.participants[0]?.role ?? ''] ?? null;
  const subject = subjectId ? state.npcs.find((n) => n.id === subjectId) : undefined;
  const subjectRel = subject ? state.relationships.find((r) => r.npcId === subject.id) : undefined;

  return {
    id: makeId('evi', state.seed, definition.id, state.character.age, state.step),
    definitionId: definition.id,
    definitionVersion: definition.version,
    atAge: state.character.age,
    card: {
      ...definition.card,
      label: interpolate(definition.card.label, state, bindings).toUpperCase(),
      who:
        subject && subjectRel
          ? {
              name: `${subject.firstName} ${subject.lastName}`,
              emoji: subject.avatarEmoji,
              relation: relationshipLabel(subjectRel, subject),
            }
          : null,
    },
    title: interpolate(definition.title, state, bindings),
    body: interpolate(definition.body, state, bindings),
    question: interpolate(definition.question, state, bindings),
    selects: definition.selects.map((select) => ({
      id: select.id,
      label: select.label,
      options:
        select.options.length > 0
          ? select.options
          : (SELECT_CATALOGUES[select.optionsFrom ?? ''] ?? [{ value: 'none', label: '—' }]),
    })),
    /*
     * Filled by whatever put this popup on screen — the fact sheet and the bars
     * belong to a specific person or offer, not to the definition, so content
     * declares the shape and the simulation supplies the values.
     */
    facts: [],
    meters: [],
    stake: definition.stake
      ? {
          label: definition.stake.label,
          value: interpolate(definition.stake.value, state, bindings),
        }
      : null,
    choices,
    participants: bindings,
    chosenChoiceId: null,
    outcomeTitle: null,
    outcomeText: null,
    historyLine: null,
    deltas: [],
  };
};


/**
 * Option lists the engine owns rather than content, because they have to agree
 * with the simulation — a major has to be one the career tracks recognise, and
 * a trade has to be one the trade school teaches.
 */
export const SELECT_CATALOGUES: Record<string, Array<{ value: string; label: string }>> = {
  majors: [
    'Computer Science',
    'Business',
    'Nursing',
    'English',
    'Engineering',
    'Economics',
    'Psychology',
    'Law',
    'Biology',
    'Education',
    'Graphic Design',
    'Political Science',
  ].map((label) => ({ value: label, label })),
  trades: ['Electrical', 'Plumbing', 'Welding', 'Automotive', 'Carpentry', 'HVAC'].map((label) => ({
    value: label,
    label,
  })),
};
