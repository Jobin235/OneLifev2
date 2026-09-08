import { chronicleYear } from './chronicle.js';

// Re-exported so the modules that already import it from here keep working.
export { pushHistory } from '@lineage/simulation';
import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { EventInstance, LifeState, Npc, WorldIndicators } from '@lineage/shared-types';
import {
  advanceBusinessYear,
  advanceCareerYear,
  advanceEducationYear,
  applyAgeDrift,
  checkInvariants,
  decayRelationships,
  driftAssetValues,
  graduate,
  isGraduating,
  isPromotable,
  pushHistory,
  makeRng,
  mortalityChance,
  narrativeSubject,
  promote,
  refreshDerived,
  rollNewConditions,
  type Rng,
  settleYear,
  syncAssetLoans,
  updateCostOfLiving,
} from '@lineage/simulation';
import { advanceNpcYear } from '@lineage/npc-engine';
import { inheritanceFrom, runNpcNews } from './npcnews.js';
import { openSymptom } from './health.js';
import { reportMarketYear } from './stocks.js';
import { advanceProperties } from './landlord.js';
import { advanceFameYear } from './fame.js';
import { advanceRoyalYear, royalBirth } from './royalty.js';
import { advanceMobYear } from './mob.js';
import { advanceVentureYear } from './venture.js';
import { resetCasinoYear } from './casino.js';
import { advanceMarketYear } from './blackmarket.js';
import { resetRacingYear } from './racing.js';
import { advanceVampireYear, vampireHoldsAge, vampireWasSlain } from './vampire.js';
import { advanceVigilanteYear } from './vigilante.js';
import { instantiate, selectEvents, type ConditionContext } from '@lineage/event-engine';
import { applyDeferred, takeAvailableJob } from './deferred.js';
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
  applyAgeDrift(state.character, config, rng, vampireHoldsAge(state));
  const npcYear = advanceNpcYear(state, config, rng);
  decayRelationships(state, config);

  /*
   * People you know die, and until now the log said nothing about it — they
   * simply stopped appearing. Say it, name them, and settle what they left.
   */
  for (const { npc, relationship, cause } of npcYear.deaths) {
    /*
     * A repeat death keeps its original wording, because it is the same death.
     * A first one is written now and recorded, so that if the player rewinds
     * past it, it comes back exactly as it was.
     */
    const manner = cause ?? deathManner(npc, rng);
    if (cause === null) {
      state.fated.push({ npcId: npc.id, atAge: npc.age, cause: manner });
    }
    pushHistory(
      state,
      'family',
      '🕯️',
      // Named, always. A life has several supervisors and several nephews, and
      // "Your supervisor died" twice reads as the log stuttering.
      `${narrativeSubject(relationship, npc, state.character.age, state)} died ${manner}.`,
      relationship.band === 'close' ? 75 : 40,
    );
    inheritanceFrom(state, npc, relationship, rng);
  }

  /*
   * And then the rest of everybody's year. Most of what the player reads in a
   * given year happened to somebody else — that is what makes a log a life
   * rather than a record of one person's stats.
   */
  runNpcNews(state, content, rng);

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
  /*
   * Being out of work is a situation, not a gap to be filled at random.
   *
   * This used to hire the character into a random job at 45% a year, which read
   * exactly as it was: a job appearing from nowhere with no application, no
   * bearing on what they had studied, and sometimes at a lower wage than the
   * one they had. Getting hired is now something the player does — "Look for
   * work" on the Do screen, against real openings — and the only automatic
   * route is the one that is actually true of life: if you need money badly
   * enough for long enough, you take whatever is going.
   */
  if (
    !state.career.current &&
    !state.career.retired &&
    !state.education.current &&
    !state.character.record.incarceration &&
    state.character.age >= 18 &&
    state.character.age < 62
  ) {
    state.yearsOutOfWork += 1;

    /*
     * People out of work look for work, and look harder the longer it goes on.
     * The rate rises with the years rather than being a flat coin flip, so
     * unemployment is a stretch of a life rather than a permanent state — an
     * earlier version required savings to run out first, which left a third of
     * characters jobless at thirty because they happened to have a cushion.
     *
     * This is the floor under a player who never opens the tab. Anyone who does
     * gets to choose, against openings that state what they want.
     */
    const lookingHarder = Math.min(0.7, 0.18 + state.yearsOutOfWork * 0.16);

    if (rng.chance(lookingHarder)) {
      const title = takeAvailableJob(state, content, config, rng);
      if (title) {
        // "a agent" is the kind of thing a player notices immediately and
        // never stops noticing.
        const article = /^[aeiou]/i.test(title) ? 'an' : 'a';
        pushHistory(
          state,
          'career',
          '💼',
          state.yearsOutOfWork >= 3
            ? `After a long stretch out of work, you took a job as ${article} ${title}.`
            : `You found work as ${article} ${title}.`,
          40,
        );
      }
    }
  } else {
    state.yearsOutOfWork = 0;
  }

  for (const business of state.businesses) advanceBusinessYear(business, world, rng);
  driftAssetValues(state, rng);
  advanceProperties(state, rng);
  reportMarketYear(state, content, world);
  advanceFameYear(state, content, rng);
  royalBirth(state, content, rng);
  advanceRoyalYear(state, content, rng);
  advanceMobYear(state, rng);
  advanceVentureYear(state, content, rng);
  resetCasinoYear(state);
  resetRacingYear(state);
  advanceMarketYear(state, content, rng);
  advanceVampireYear(state, rng);
  advanceVigilanteYear(state, content, rng);
  serveTime(state);
  /*
   * A maze is a thing you are in the middle of, not a thing you carry. Ageing
   * up abandons an unfinished one — the year moved on and the yard is watched
   * again — and clears the annual attempt so next year has its own.
   */
  if (state.escape?.outcome !== null) state.escape = null;
  delete state.flags.escape_attempts_this_year;

  // 4. Health, then money.
  /*
   * A new condition raises a symptom rather than appearing in the log fully
   * diagnosed. Getting ill is one of the few things in a life that is
   * unambiguously a decision about money, and it used to be a number quietly
   * falling — see docs/BITLIFE-LOOP-SPEC.md §5.
   *
   * Only the first of a year gets the popup; a second one that year is recorded
   * and left for a later year to raise, because two symptom cards back to back
   * reads as the game malfunctioning.
   */
  if (country) {
    const found = rollNewConditions(state, country, rng);
    const untreated = found.find((f) => !f.treated);
    const condition = untreated
      ? state.character.conditions.find((c) => c.id === untreated.id)
      : undefined;
    if (condition && !state.activeEvent) {
      openSymptom(state, condition, country.healthcare.patientShare, content, rng);
    }
  }
  const city = country?.cities.find((c) => c.id === state.character.cityId);
  updateCostOfLiving(state, config, city?.costOfLiving ?? 1);
  const money = settleYear(state, config);
  syncAssetLoans(state);

  /*
   * Say when the year did not add up.
   *
   * The going-without model is correct — nobody borrows indefinitely against no
   * income, so a shortfall becomes doing without rather than debt — but it was
   * silent. The player saw expenses of $13,680, watched nothing leave their
   * account, and reasonably concluded the money was made up.
   */
  /*
   * Log the change, not the state, and only once it has held.
   *
   * A decade of poverty is one hard stretch rather than ten identical lines,
   * and a single lean year is not a hard stretch at all — without the second
   * rule a character oscillating around the line announces it every other year.
   */
  const shortThisYear = money.wentWithout > 0;
  state.struggleYears = shortThisYear === state.struggling ? 0 : state.struggleYears + 1;

  if (state.struggleYears >= 2) {
    state.struggling = shortThisYear;
    state.struggleYears = 0;
    /*
     * Worded differently each time. A life can genuinely fall into hardship
     * twice, and when it does the player should read two sentences rather than
     * the same one twice — which reads as a bug even when the event is real.
     */
    const line = shortThisYear
      ? rng.pick([
          'Money stopped covering the month, and you started going without.',
          'The sums stopped working. You got very good at the cheap shop.',
          'You started leaving things in the basket at the till.',
        ])
      : rng.pick([
          'Things eased off. You stopped counting every week.',
          'The money caught up with the month again.',
          'You bought something you did not strictly need, and enjoyed it.',
        ]);
    pushHistory(state, 'money', shortThisYear ? '🥫' : '🌤️', line, 35);
  }

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
  // Diminishing returns reset with the year: training helps again in January.
  state.activityUsage = {};
  state.interactionUsage = {};
  state.applicationsThisYear = 0;

  /*
   * 7. Death check, before events — a dead character gets no card.
   *
   * A vampire is exempt from the ordinary roll, which is the whole of what
   * being one buys, and is not exempt from the hunter who was waiting outside.
   */
  if (vampireWasSlain(state)) {
    return die(state, content, config, before, startAge);
  }
  if (!vampireHoldsAge(state) && rng.chance(mortalityChance(state.character, config))) {
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

  // The texture of the year, around whatever the events did.
  chronicleYear(state, content, config, rng);

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
  if (state.flags.vamp_slain) return 'a hunter, with something wooden';
  const untreated = state.character.conditions.filter((c) => !c.treated);
  if (state.character.stats.health < 20 && untreated.length > 0) return untreated[0]!.label.toLowerCase();
  if (state.character.age >= 80) return 'age';
  if (state.character.stats.health < 25) return 'poor health';
  return 'age';
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


/**
 * How somebody went. Deliberately plain: most people die of being old, at home,
 * and the log should not turn every death into a set piece.
 */
const deathManner = (npc: Npc, rng: Rng): string => {
  if (npc.age >= 75) {
    return rng.pick([
      'while sleeping peacefully',
      'peacefully, at home',
      'after a short illness',
      'of old age',
    ]);
  }
  if (npc.age >= 45) {
    return rng.pick(['of a heart attack', 'after a short illness', 'suddenly, at work']);
  }
  return rng.pick(['in a car accident', 'suddenly', 'after a long illness']);
};
