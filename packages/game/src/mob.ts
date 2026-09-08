import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import {
  MOB_CUT,
  MOB_RANKS,
  MOB_TITLES,
  clampStat,
  type LifeState,
  type MobRank,
} from '@lineage/shared-types';
import { checkInvariants, makeRng, pushHistory, refreshDerived, type Rng } from '@lineage/simulation';
import { openCharges } from './justice.js';

/**
 * The family.
 *
 * A career ladder that will not take an application and cannot be resigned
 * from. You are noticed because of a record, taken on at the bottom, and you
 * rise by earning for people above you — your cut going from a tenth to three
 * quarters on the way up. BitLife's ranks, cuts and rough timescale;
 * see docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class MobRejected extends Error {}

/** Jobs a year. The ceiling on how fast a life can be spent on this. */
const JOBS_A_YEAR = 3;

const RANK_ORDER: Record<MobRank, number> = {
  associate: 0,
  soldier: 1,
  caporegime: 2,
  underboss: 3,
  godfather: 4,
};

const FAMILIES = [
  'the Cavallo family',
  'the Bracco family',
  'the Ostrowski outfit',
  'the Nunes family',
  'the Halloran crew',
  'the Vitale family',
];

/**
 * What it takes to move up.
 *
 * Years at the rank and standing, both. Standing alone would let a good year
 * buy a promotion; years alone would make the ladder a queue. BitLife's own
 * figure is six to eight years for a first promotion and ten to twenty-five to
 * the top, which is roughly what these produce.
 */
const PROMOTION: Record<MobRank, { years: number; standing: number; earned: number } | null> = {
  associate: { years: 4, standing: 55, earned: 200_000_00 },
  soldier: { years: 5, standing: 65, earned: 1_200_000_00 },
  caporegime: { years: 6, standing: 75, earned: 6_000_000_00 },
  underboss: { years: 7, standing: 88, earned: 25_000_000_00 },
  godfather: null,
};

const titleFor = (rank: MobRank, sex: string): string =>
  sex === 'female' ? MOB_TITLES[rank].female : MOB_TITLES[rank].male;

/* ------------------------------------------------------------------ *
 * Getting in
 * ------------------------------------------------------------------ */

/**
 * Whether anybody would have you.
 *
 * A record, and the right kind: they are not interested in a fraud conviction
 * or an unpaid fine. BitLife gates this on a history of violence and theft, and
 * the point of the gate is that you cannot decide at thirty to have been the
 * sort of person they recruit.
 */
const WANTED_OFFENCES = /theft|robbery|burgl|assault|violence|weapon|murder|manslaughter|car/i;

export const mobEligibility = (state: LifeState): { open: boolean; reason: string } => {
  if (state.mob) return { open: false, reason: 'You are already in' };
  if (state.character.age < 18) return { open: false, reason: 'They do not take children' };
  if (state.character.record.incarceration) {
    return { open: false, reason: 'Not from in here' };
  }

  const form = state.character.record.convictions.filter((c) => WANTED_OFFENCES.test(c.offence));
  if (form.length === 0) {
    return { open: false, reason: 'Nobody has heard of you' };
  }
  return { open: true, reason: '' };
};

/** Takes the meeting. */
export const joinMob = (state: LifeState, config: GameConfig): LifeState => {
  const eligible = mobEligibility(state);
  if (!eligible.open) throw new MobRejected(eligible.reason.toLowerCase());
  if (state.activeEvent) throw new MobRejected('answer the open decision first');

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'mob', 'join', state.character.age);
    state.step += 1;
    const family = rng.pick(FAMILIES);
    state.mob = {
      family,
      rank: 'associate',
      title: titleFor('associate', state.character.sex),
      standing: 30,
      earned: 0,
      joinedAtAge: state.character.age,
      yearsAtRank: 0,
      made: false,
      jobsThisYear: 0,
    };

    pushHistory(
      state,
      'crime',
      '🕴️',
      `Somebody from ${family} bought you a drink and did not ask you anything. You are an Associate now.`,
      75,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The work
 * ------------------------------------------------------------------ */

export const MOB_JOBS = ['collect', 'move', 'hit', 'sitdown'] as const;
export type MobJob = (typeof MOB_JOBS)[number];

interface JobSpec {
  icon: string;
  label: string;
  note: string;
  /** What the job brings in for the family, before your cut. */
  take: [number, number];
  standing: number;
  /** Chance of being charged for it, before smarts. */
  risk: number;
  offence: string;
  sentenceYears: number;
  lines: string[];
}

const JOBS: Record<MobJob, JobSpec> = {
  collect: {
    icon: '💼',
    label: 'Collect a debt',
    note: 'Small money, and they remember who turned up',
    take: [40_000_00, 160_000_00],
    standing: 6,
    risk: 0.1,
    offence: 'Extortion',
    sentenceYears: 3,
    lines: [
      'You stood in a doorway for an hour and the money arrived.',
      'You did not have to say anything. That was rather the point.',
      'He paid, and then he paid again for having made you come.',
    ],
  },
  move: {
    icon: '🚚',
    label: 'Move something',
    note: 'Real money, and nobody tells you what is in it',
    take: [200_000_00, 900_000_00],
    standing: 11,
    risk: 0.22,
    offence: 'Trafficking',
    sentenceYears: 8,
    lines: [
      'You drove it across two counties and did not look in the back.',
      'The lorry went out full and came back empty and that was all anybody said.',
      'You handed over the keys in a car park and were paid in a bag.',
    ],
  },
  hit: {
    icon: '🔪',
    label: 'Take a contract',
    note: 'What they ask before they make you',
    take: [300_000_00, 1_400_000_00],
    standing: 24,
    risk: 0.3,
    offence: 'Murder',
    sentenceYears: 25,
    lines: [
      'It was done in a car park in the afternoon and nobody came forward.',
      'You waited three weeks for the right evening and it took nine seconds.',
      'He knew what it was the moment he saw you, which made it worse and quicker.',
    ],
  },
  sitdown: {
    icon: '🤝',
    label: 'Sit down with the other family',
    note: 'No money. They remember who went',
    take: [0, 0],
    standing: 16,
    risk: 0.05,
    offence: 'Conspiracy',
    sentenceYears: 5,
    lines: [
      'Four hours, one pot of coffee, and nobody died over it.',
      'You said the thing everybody was thinking and it did not go badly.',
      'They left first, which everybody in the room noticed.',
    ],
  },
};

export interface MobJobResult {
  state: LifeState;
  line: string;
  /** Your cut, formatted, or null when there was no money in it. */
  cut: string | null;
  charged: boolean;
}

/**
 * Do a job.
 *
 * The money is the family's and your cut is your rank, which is what makes the
 * ladder worth climbing rather than a set of titles. Getting caught runs
 * through the ordinary justice flow — a charge, a lawyer you pay for, a plea —
 * because there is no reason a mob arrest should work differently from any
 * other, and every reason it should not.
 */
export const doMobJob = (
  state: LifeState,
  job: MobJob,
  content: ContentPack,
  config: GameConfig,
): MobJobResult => {
  const mob = state.mob;
  if (!mob) throw new MobRejected('you are not in anything');
  if (!state.character.alive) throw new MobRejected('a dead character cannot work');
  if (state.activeEvent) throw new MobRejected('answer the open decision first');

  const lock = mobLock(state, job);
  if (lock) throw new MobRejected(lock.toLowerCase());

  const spec = JOBS[job];
  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'mobjob', job, state.character.age, mob.jobsThisYear);
    state.step += 1;
    mob.jobsThisYear += 1;

    /*
     * Smarts buy you about half the risk, the same way they do on every other
     * crime in this game. Being careful is a stat, not a choice.
     */
    const risk = spec.risk * (1 - state.character.stats.smarts / 200);
    if (rng.chance(risk)) {
      mob.standing = clampStat(mob.standing - 12);
      openCharges(
        state,
        {
          offence: spec.offence,
          sentenceYears: spec.sentenceYears,
          fine: 0,
          facility: spec.sentenceYears >= 10 ? 'the state penitentiary' : 'the county jail',
        },
        content,
        rng,
      );
      const line = `It went wrong. They have you for ${spec.offence.toLowerCase()}.`;
      refreshDerived(state, config);
      checkInvariants(state, before);
      return { state, line, cut: null, charged: true };
    }

    const take = spec.take[1] > 0 ? rng.int(spec.take[0], spec.take[1]) : 0;
    const cut = Math.round(take * MOB_CUT[mob.rank]);
    mob.earned += take;
    mob.standing = clampStat(mob.standing + spec.standing);
    state.character.finances.cash += cut;

    if (job === 'hit') {
      state.character.stats.happiness = clampStat(state.character.stats.happiness - 9);
      /*
       * The oath. BitLife will not make you a soldier until you have killed for
       * them, and this is the flag that gate reads.
       */
      if (!mob.made) {
        mob.made = true;
        pushHistory(
          state,
          'crime',
          '🕯️',
          `${mob.family.replace(/^the /, '')} took you into a back room and made you swear to something. You are one of them now.`,
          80,
        );
      }
    }

    const line = rng.pick(spec.lines);
    pushHistory(state, 'crime', spec.icon, line, 30);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return {
      state,
      line,
      cut: cut > 0 ? `$${Math.round(cut / 100).toLocaleString('en-US')}` : null,
      charged: false,
    };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** Why a job is not available, or null when it is. */
export const mobLock = (state: LifeState, job: MobJob): string | null => {
  const mob = state.mob;
  if (!mob) return 'You are not in anything';
  if (state.character.record.incarceration) return 'Not from in here';
  if (mob.jobsThisYear >= JOBS_A_YEAR) return 'You have done enough this year';
  if (job === 'sitdown' && RANK_ORDER[mob.rank] < RANK_ORDER.caporegime) {
    return 'You are not senior enough to be in that room';
  }
  if (job === 'move' && RANK_ORDER[mob.rank] < RANK_ORDER.soldier && !mob.made) {
    return 'They do not trust you with that yet';
  }
  return null;
};

/* ------------------------------------------------------------------ *
 * The year
 * ------------------------------------------------------------------ */

/**
 * One year in: promotion, or the slow drift of being forgotten about.
 */
export const advanceMobYear = (state: LifeState, rng: Rng): void => {
  const mob = state.mob;
  if (!mob || !state.character.alive) return;

  const worked = mob.jobsThisYear > 0;
  mob.jobsThisYear = 0;
  mob.yearsAtRank += 1;

  /*
   * A year of doing nothing costs standing. There is no notice period in this
   * organisation, but there is being left off the list.
   */
  if (!worked) mob.standing = clampStat(mob.standing - 7);

  const bar = PROMOTION[mob.rank];
  if (!bar) return;

  const madeGate = mob.rank === 'associate' && !mob.made;
  if (
    !madeGate &&
    mob.yearsAtRank >= bar.years &&
    mob.standing >= bar.standing &&
    mob.earned >= bar.earned
  ) {
    const next = MOB_RANKS[RANK_ORDER[mob.rank] + 1]!;
    mob.rank = next;
    mob.title = titleFor(next, state.character.sex);
    mob.yearsAtRank = 0;
    mob.standing = clampStat(mob.standing - 15);
    pushHistory(
      state,
      'crime',
      '🥃',
      `${mob.family.replace(/^the /, '')} moved you up. You are a ${mob.title} now.`,
      70,
    );
    return;
  }

  /*
   * And the other way it can go. Standing on the floor with the family is not a
   * demotion, it is a car journey — but only once you are made, because nobody
   * bothers to kill an associate.
   */
  if (mob.made && mob.standing <= 4 && rng.chance(0.35)) {
    state.flags.mob_marked = true;
    pushHistory(
      state,
      'crime',
      '☠️',
      `Somebody from ${mob.family} asked where you had been lately. It was not a friendly question.`,
      85,
    );
  }
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

const STANDING_WORD = (n: number): string => {
  if (n >= 80) return 'Trusted';
  if (n >= 55) return 'Solid';
  if (n >= 30) return 'Useful';
  if (n >= 10) return 'A name on a list';
  return 'A problem';
};

export interface MobView {
  family: string;
  title: string;
  rank: MobRank;
  standing: number;
  standingWord: string;
  /** "You keep 25% of what you bring in." */
  cutLine: string;
  earned: string;
  /** What the next rung wants, said plainly, or null at the top. */
  next: string | null;
  made: boolean;
  jobsLeft: number;
  jobs: Array<{
    id: MobJob;
    icon: string;
    label: string;
    note: string;
    available: boolean;
    locked: string | null;
  }>;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export const mobView = (state: LifeState): MobView | null => {
  const mob = state.mob;
  if (!mob) return null;

  const bar = PROMOTION[mob.rank];
  const wants: string[] = [];
  if (bar) {
    if (mob.rank === 'associate' && !mob.made) wants.push('they have to make you first');
    if (mob.yearsAtRank < bar.years) wants.push(`${bar.years - mob.yearsAtRank} more years`);
    if (mob.standing < bar.standing) wants.push('better standing');
    if (mob.earned < bar.earned) wants.push(`${money(bar.earned - mob.earned)} more brought in`);
  }

  return {
    family: mob.family,
    title: mob.title,
    rank: mob.rank,
    standing: mob.standing,
    standingWord: STANDING_WORD(mob.standing),
    cutLine: `You keep ${Math.round(MOB_CUT[mob.rank] * 100)}% of what you bring in`,
    earned: money(mob.earned),
    next: bar ? (wants.length > 0 ? wants.join(' · ') : 'They are talking about you') : null,
    made: mob.made,
    jobsLeft: Math.max(0, JOBS_A_YEAR - mob.jobsThisYear),
    jobs: MOB_JOBS.map((id) => {
      const locked = mobLock(state, id);
      return {
        id,
        icon: JOBS[id].icon,
        label: JOBS[id].label,
        note: JOBS[id].note,
        available: locked === null,
        locked,
      };
    }),
  };
};
