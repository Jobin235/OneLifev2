import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { EventInstance, LifeState, WorldIndicators } from '@lineage/shared-types';
import {
  actionsForStage,
  advanceBusinessYear,
  advanceCareerYear,
  advanceEducationYear,
  applyAgeDrift,
  checkInvariants,
  decayRelationships,
  graduate,
  isGraduating,
  isPromotable,
  makeId,
  makeRng,
  mortalityChance,
  promote,
  refreshDerived,
  rollNewConditions,
  settleYear,
  updateCostOfLiving,
} from '@lineage/simulation';
import { advanceNpcYear } from '@lineage/npc-engine';
import { instantiate, selectEvents, type ConditionContext } from '@lineage/event-engine';
import { applyDeferred } from './deferred.js';
import { quietYearLine } from '@lineage/narrative';
import { buildLegacy } from './death.js';
import { advanceSchooling, graduationLine } from './schooling.js';

export interface AgeUpResult {
  state: LifeState;
  /** The card to show, if the year produced one. */
  event: EventInstance | null;
  /** Design 1B: the four lines and the stat deltas. */
  recap: {
    age: number;
    lines: Array<{ icon: string; text: string }>;
    statDeltas: Array<{ key: string; icon: string; label: string; value: number; delta: number }>;
    foreshadow: string | null;
  };
  died: boolean;
}

const STAT_META: Record<string, { icon: string; label: string }> = {
  health: { icon: '❤️', label: 'Health' },
  happiness: { icon: '😊', label: 'Happiness' },
  smarts: { icon: '🧠', label: 'Smarts' },
  fitness: { icon: '💪', label: 'Fitness' },
  charm: { icon: '😎', label: 'Charm' },
};

/**
 * One life year, in the order of spec §106.
 *
 * The caller is responsible for the transaction boundary: this function mutates
 * the state it is given, and if `checkInvariants` throws at the end the caller
 * must discard it rather than persist it (§183).
 */
export const advanceYear = (
  state: LifeState,
  world: WorldIndicators,
  content: ContentPack,
  config: GameConfig,
): AgeUpResult => {
  if (!state.character.alive) throw new Error('cannot age up a dead character');
  if (state.activeEvent) throw new Error('an open decision must be answered before ageing up');

  const before = structuredClone(state);
  const startAge = state.character.age;
  const rng = makeRng(state.seed, 'ageup', startAge, state.step);

  // 1. Advance age and clear the year.
  state.character.age += 1;
  state.step += 1;
  state.currentYearEntryIds = [];
  state.resolvedEvent = null;
  state.gameState = 'PROCESSING';

  // 2. Time passing, to the body and to the people.
  applyAgeDrift(state.character, config, rng);
  advanceNpcYear(state, config, rng);
  decayRelationships(state, config);

  // 3. Institutions: school, work, businesses, prison.
  const country = content.countriesById.get(state.character.countryId);
  if (state.education.current) {
    advanceEducationYear(state, rng);
    if (isGraduating(state)) {
      const enrolment = state.education.current;
      const completed = enrolment.gradePoints >= 110;
      graduate(state, completed);
      pushHistory(
        state,
        'education',
        completed ? '🎓' : '🚪',
        graduationLine(enrolment.stage, enrolment.institutionName, completed),
        completed && enrolment.stage !== 'primary' ? 70 : 30,
      );
    }
  }
  if (country) advanceSchooling(state, country, content, rng);
  if (state.career.current) {
    advanceCareerYear(state, config, rng);

    /*
     * Ordinary career progress just happens. The `career_promotion` event is the
     * dramatic version — the one with a rival and a decision — but if climbing a
     * ladder were only ever an event, most lives would stall on the bottom rung
     * for fifty years, which is neither true nor interesting.
     */
    const job = state.career.current;
    const track = content.careersById.get(job.trackId);
    if (track && isPromotable(state, track, config) && rng.chance(0.35)) {
      const from = job.title;
      if (promote(state, track)) {
        pushHistory(
          state,
          'career',
          '📈',
          `You went from ${from} to ${state.career.current!.title}.`,
          55,
        );
      }
    }
  }
  for (const business of state.businesses) advanceBusinessYear(business, world, rng);
  serveTime(state);

  // 4. Health, then money.
  if (country) rollNewConditions(state, country, rng);
  const city = country?.cities.find((c) => c.id === state.character.cityId);
  updateCostOfLiving(state, config, city?.costOfLiving ?? 1);
  settleYear(state, config);

  // 5. Retirement is automatic and unglamorous.
  if (state.character.age >= 67 && state.career.current && rng.chance(0.35)) {
    state.career.history.push({
      trackId: state.career.current.trackId,
      employerName: state.career.current.employerName,
      title: state.career.current.title,
      fromAge: state.character.age - state.career.current.yearsAtEmployer,
      toAge: state.character.age,
      endedBy: 'retired',
    });
    state.career.current = null;
    state.career.retired = true;
    state.character.finances.salary = 0;
    state.character.finances.otherIncome = Math.round(before.character.finances.salary * 0.4);
    pushHistory(state, 'career', '🎣', 'You retired.', 70);
  }

  // 6. Refresh everything derived before events read it.
  refreshDerived(state, config);
  state.actionsPerYear = actionsForStage(state.character.age, config);
  state.actionsRemaining = state.actionsPerYear;

  // 7. Death check, before events — a dead character gets no card.
  if (rng.chance(mortalityChance(state.character, config))) {
    return die(state, content, config, before, startAge);
  }

  // 8. Choose what happens this year.
  const ctx: ConditionContext = { state, world, bindings: {} };
  const selection = selectEvents(content.events, state, ctx, config, content.traitsById, rng);

  let card: EventInstance | null = null;
  if (selection.major) {
    card = instantiate(selection.major, state, ctx);
    state.activeEvent = card;
    state.gameState = 'EVENT_AVAILABLE';
    // A scheduled event is consumed whether or not it is resolved this instant.
    if (selection.major.scheduled) {
      state.pending = state.pending.filter((p) => p.id !== selection.major!.scheduled!.id);
    }
  } else {
    state.gameState = 'IDLE';
  }

  // Minor events resolve themselves; they are recap lines, not decisions (§19).
  for (const minor of selection.minor) {
    const choice = minor.definition.choices[0];
    const outcome = choice?.outcomes[choice.outcomes.length - 1];
    if (!outcome) continue;
    pushHistory(state, minor.definition.category, minor.definition.card.icon, outcome.historyLine, 15);
    (state.eventLog[minor.definition.id] ??= []).push(state.character.age);
  }

  const result: AgeUpResult = {
    state,
    event: card,
    recap: buildRecap(state, before, startAge),
    died: false,
  };

  checkInvariants(state, before);
  return result;
};

/** Prison years pass differently, and they pass whether you want them to or not. */
const serveTime = (state: LifeState): void => {
  const inside = state.character.record.incarceration;
  if (!inside) return;

  inside.yearsServed += 1;
  inside.paroleEligibleIn = Math.max(0, inside.paroleEligibleIn - 1);

  if (inside.yearsServed >= inside.totalYears) {
    state.character.record.incarceration = null;
    pushHistory(state, 'prison', '🚪', `You got out after ${inside.totalYears} years.`, 80);
    // Design 5D: a record closes named doors, and the country decides how many.
    state.career.closedTrackIds.push('medicine', 'law', 'politics', 'teaching');
  }
};

const die = (
  state: LifeState,
  content: ContentPack,
  config: GameConfig,
  before: LifeState,
  startAge: number,
): AgeUpResult => {
  state.character.alive = false;
  state.character.deathAge = state.character.age;
  state.character.causeOfDeath = causeOfDeath(state);
  state.activeEvent = null;
  state.gameState = 'LIFE_COMPLETE';
  state.actionsRemaining = 0;

  pushHistory(
    state,
    'family',
    '🕯️',
    `You died at ${state.character.age}.`,
    100,
  );

  state.legacy = buildLegacy(state, content, config);

  checkInvariants(state, before);
  return { state, event: null, recap: buildRecap(state, before, startAge), died: true };
};

const causeOfDeath = (state: LifeState): string => {
  const untreated = state.character.conditions.filter((c) => !c.treated);
  if (state.character.stats.health < 20 && untreated.length > 0) return untreated[0]!.label.toLowerCase();
  if (state.character.age >= 80) return 'age';
  if (state.character.stats.health < 25) return 'poor health';
  return 'age';
};

export const pushHistory = (
  state: LifeState,
  category: string,
  icon: string,
  line: string,
  significance: number,
  npcIds: string[] = [],
): void => {
  const entry = {
    id: makeId('his', state.seed, line, state.character.age, state.history.length),
    atAge: state.character.age,
    category: category as never,
    icon,
    line,
    significance,
    eventInstanceId: null,
    npcIds,
  };
  state.history.push(entry);
  state.currentYearEntryIds.push(entry.id);
};

/**
 * Design 1B: four lines, the stats that actually moved, and one line hinting at
 * what is coming — so the next Age Up has a pull.
 */
const buildRecap = (state: LifeState, before: LifeState, ofAge: number): AgeUpResult['recap'] => {
  const recorded = before.currentYearEntryIds
    .map((id) => before.history.find((e) => e.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)
    .sort((a, b) => b.significance - a.significance)
    .slice(0, 4)
    .map((entry) => ({ icon: entry.icon, text: entry.line }));

  // The reward screen always says something. See quietYearLine.
  const lines = recorded.length > 0 ? recorded : [quietYearLine(ofAge)];

  const statDeltas = Object.entries(state.character.stats)
    .map(([key, value]) => ({
      key,
      icon: STAT_META[key]?.icon ?? '•',
      label: STAT_META[key]?.label ?? key,
      value,
      delta: value - (before.character.stats[key as keyof typeof before.character.stats] ?? value),
    }))
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { age: ofAge, lines, statDeltas, foreshadow: foreshadow(state) };
};

/** An honest tell, drawn from state the player cannot see yet. */
const foreshadow = (state: LifeState): string | null => {
  const soon = state.pending
    .filter((p) => p.dueAtAge - state.character.age <= 2)
    .sort((a, b) => a.dueAtAge - b.dueAtAge)[0];
  if (soon) return 'Something has been building. It will land soon.';

  const restless = state.relationships.find((r) => r.onTheirMind !== null);
  if (restless) {
    const npc = state.npcs.find((n) => n.id === restless.npcId);
    if (npc) return `${npc.firstName} has something on ${npc.sex === 'female' ? 'her' : 'his'} mind.`;
  }

  if (state.career.current && state.career.current.performance >= 78) {
    return 'Work has noticed you. That tends to mean a decision.';
  }
  if (state.character.stats.health < 45) return 'Your body has started making a point of it.';
  return null;
};

export { applyDeferred };
