import { chronicleYear } from './chronicle.js';
import { advanceWorldYear } from './news.js';
import { recostLiving } from './costs.js';

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
} from '@lineage/simulation';
import { advanceNpcYear } from '@lineage/npc-engine';
import { inheritanceFrom, runNpcNews } from './npcnews.js';
import { openCheckup, openSymptom } from './health.js';
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
import { instantiate, interpolate, selectEvents, type ConditionContext } from '@lineage/event-engine';
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

  /*
   * 2. Time passing — to the world first, because how the year went for
   * everybody is part of how it went for this person.
   */
  const worldNow = advanceWorldYear(state, world, config, rng);

  applyAgeDrift(
    state.character,
    config,
    rng,
    {
      educationLevel: educationLevelOf(state),
      recentActivity: state.recentActivity,
      closeness: closenessOf(state),
      comfort: comfortOf(state),
    },
    vampireHoldsAge(state),
  );

  /*
   * Looking after yourself is a habit, not a purchase. What the character has
   * been doing lately bleeds away at about a quarter a year, so a burst of
   * training at thirty does not still be holding fitness up at sixty — but a
   * few sessions every year does.
   */
  for (const key of ['fitness', 'study', 'charm'] as const) {
    state.recentActivity[key] = Math.max(0, state.recentActivity[key] * 0.72);
  }
  /*
   * Being at school is studying, whether or not the player ever taps anything,
   * and a job is a mild version of the same. Without this a character who does
   * nothing but attend drifts toward the smarts of somebody who does not.
   */
  if (state.education.current) {
    state.recentActivity.study = Math.min(8, state.recentActivity.study + 1.6);
  } else if (state.career.current) {
    state.recentActivity.study = Math.min(8, state.recentActivity.study + 0.4);
  }
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

  for (const business of state.businesses) advanceBusinessYear(business, worldNow, rng);
  driftAssetValues(state, rng);
  advanceProperties(state, rng);
  reportMarketYear(state, content, worldNow);
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

    /*
     * And, when there is no new symptom, the appointment about the old ones.
     *
     * This is what carries the late game. Conditions accumulate — the median
     * sixty-year-old carries four — and before this nothing ever asked about
     * them again, which is why 92% of years after seventy had no decision in
     * them. Every two years or so, the doctor reads the list back with prices
     * on it. See packages/game/src/health.ts.
     */
    if (!state.activeEvent && state.character.age >= 30) {
      const untreated = state.character.conditions.filter((c) => !c.treated).length;
      const since = state.character.age - Number(state.flags.last_checkup ?? -99);
      const due = untreated >= 3 ? 2 : untreated === 2 ? 3 : 5;
      if (untreated > 0 && since >= due && rng.chance(0.45 + untreated * 0.1)) {
        state.flags.last_checkup = state.character.age;
        openCheckup(state, country.healthcare.patientShare, content, rng);
      }
    }
  }
  recostLiving(state, content, config);
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
  const ctx: ConditionContext = { state, world: worldNow, bindings: {} };
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
    /*
     * Through the resolver, like everything else the player reads.
     *
     * This pushed the raw template, so any minor event whose history line named
     * something — an employer, a school, a person — printed the token instead.
     * It had gone unnoticed because no minor event happened to use one until
     * the work pack did.
     */
    pushHistory(
      state,
      minor.definition.category,
      minor.definition.card.icon,
      interpolate(outcome.historyLine, state, minor.bindings),
      15,
    );
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

/** 0..5, the ceiling that smarts drifts toward. */
const EDUCATION_RANK: Record<string, number> = {
  none: 0,
  primary: 1,
  secondary: 2,
  vocational: 3,
  university: 4,
  graduate: 5,
};

/**
 * How much of this life has people in it, from nobody to enough.
 *
 * Only the ones who are alive and who actually like them count — a wife you
 * never speak to is not company — and it saturates, because the difference
 * between three people who love you and thirty is not a difference in how
 * lonely you are.
 */
const CLOSENESS_WEIGHT: Record<string, number> = {
  spouse: 1.6,
  partner: 1.3,
  child: 0.7,
  friend: 0.5,
  best_friend: 0.8,
  mother: 0.4,
  father: 0.4,
  sibling: 0.4,
};

const closenessOf = (state: LifeState): number => {
  let weight = 0;
  for (const rel of state.relationships) {
    const per = CLOSENESS_WEIGHT[rel.kind];
    if (per === undefined) continue;
    const warmth = (rel.dimensions.affection + rel.dimensions.closeness) / 2;
    if (warmth < 55) continue;
    const npc = state.npcs.find((n) => n.id === rel.npcId);
    if (!npc?.alive) continue;
    weight += per * ((warmth - 55) / 45);
  }
  // A child with two parents who love them is not lonely; the world they are
  // measured against is smaller.
  return Math.min(1, weight / (state.character.age < 18 ? 1.2 : 2.4));
};

/**
 * Whether money has stopped being something they think about.
 *
 * Not how rich they are — how many years they could stop earning for. Debt they
 * cannot see the end of counts against it, because that is what the worry
 * actually is.
 */
const comfortOf = (state: LifeState): number => {
  const f = state.character.finances;
  // Still somebody else's dependant: it is the household's money that decides
  // whether money is a worry, and they have none of their own to measure.
  if (state.character.age < 18 && f.annualExpenses === 0) {
    const wealth = state.flags.family_wealth;
    // `family_wealth` runs 0.25 (rough) to 3.2 (comfortable).
    return typeof wealth === 'number' ? Math.max(0, Math.min(1, 0.15 + wealth / 4)) : 0.5;
  }
  const floor = Math.max(f.annualExpenses, 1_000_000);
  const runway = (f.cash + f.savings + f.investments - f.debt) / floor;
  return Math.max(0, Math.min(1, runway / 6));
};

const educationLevelOf = (state: LifeState): number => {
  const done = EDUCATION_RANK[state.education.highestCompleted] ?? 0;
  // Being in it counts for something while you are still in it.
  const enrolled = state.education.current ? (EDUCATION_RANK[state.education.current.stage] ?? 0) - 0.5 : 0;
  return Math.max(done, enrolled);
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
