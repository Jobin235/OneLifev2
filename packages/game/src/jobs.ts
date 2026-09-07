import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { CareerTrack, EducationStage, LifeState } from '@lineage/shared-types';
import { checkInvariants, makeRng, refreshDerived } from '@lineage/simulation';
import { employerNameFor } from './deferred.js';
import { openInterview } from './interview.js';

/**
 * Looking for work.
 *
 * Jobs used to be assigned at random, which read exactly as it was: employment
 * appearing from nowhere, unrelated to what the character had studied or built,
 * sometimes at a lower wage than the job they already had. Everything here
 * exists so a player can answer "why did I get this job, and why not that one".
 *
 * An opening states its requirements before you apply, so a stat is visibly the
 * reason you can or cannot have something rather than a number that drifts.
 */

export class ApplicationRejected extends Error {}

const EDUCATION_ORDER: EducationStage[] = [
  'none',
  'primary',
  'secondary',
  'vocational',
  'university',
  'graduate',
];

const EDUCATION_LABEL: Record<string, string> = {
  none: 'no qualifications',
  primary: 'primary school',
  secondary: 'secondary school',
  vocational: 'a trade qualification',
  university: 'a degree',
  graduate: 'a postgraduate degree',
};

export interface Opening {
  trackId: string;
  title: string;
  employer: string;
  /** Formatted for display. */
  salary: string;
  salaryCents: number;
  industry: string;
  /** The company running the opening, named in the interview. */
  employerName: string;
  /** "Needs a degree · smarts 65" — stated before you apply. */
  requirements: string[];
  /** Whether the character meets every requirement. */
  qualified: boolean;
  /** The one thing standing in the way, when there is exactly one. */
  missing: string | null;
  /** Rough odds of being offered it, given how far past the bar they are. */
  chance: number;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** How far past a track's requirements this character is, 0..1. */
const strengthFor = (state: LifeState, track: CareerTrack): number => {
  const stats = state.character.stats;
  const required = Object.entries(track.requiredStats);
  if (required.length === 0) return 0.75;

  const margins = required.map(([stat, need]) => {
    const have = stats[stat as keyof typeof stats] ?? 0;
    return Math.max(0, Math.min(1, (have - Number(need)) / 30));
  });
  return margins.reduce((sum, m) => sum + m, 0) / margins.length;
};

export const requirementsOf = (state: LifeState, track: CareerTrack): { lines: string[]; missing: string[] } => {
  const lines: string[] = [];
  const missing: string[] = [];

  if (track.requiredEducation !== 'none') {
    const label = EDUCATION_LABEL[track.requiredEducation] ?? track.requiredEducation;
    lines.push(`Needs ${label}`);
    if (
      EDUCATION_ORDER.indexOf(state.education.highestCompleted) <
      EDUCATION_ORDER.indexOf(track.requiredEducation as EducationStage)
    ) {
      missing.push(`You need ${label}`);
    }
  }

  for (const [stat, need] of Object.entries(track.requiredStats)) {
    lines.push(`${stat} ${need}+`);
    const have = state.character.stats[stat as keyof typeof state.character.stats] ?? 0;
    if (have < Number(need)) missing.push(`Your ${stat} is ${have}; they want ${need}`);
  }

  if (lines.length === 0) lines.push('No qualifications needed');
  return { lines, missing };
};

/**
 * What is actually going, this year.
 *
 * A stable shortlist rather than the whole catalogue: seventy-six ladders is a
 * spreadsheet, six openings is a decision. It is seeded on the character's age
 * so the list does not reshuffle every time the screen is opened.
 */
export const openings = (state: LifeState, content: ContentPack): Opening[] => {
  const rng = makeRng(state.seed, 'jobmarket', state.character.age);
  const held = EDUCATION_ORDER.indexOf(state.education.highestCompleted);
  const wage = content.countriesById.get(state.character.countryId)?.wageMultiplier ?? 1;

  const reachable = content.careers.filter((track) => {
    /*
     * Nobody advertises for a movie star. The tracks you have to be seen for
     * live on the Fame screen instead, behind an audition — putting them in the
     * ordinary listing would make becoming an actor a matter of clicking apply
     * on a Tuesday, which is the one thing the profession is famously not.
     */
    if (track.auditions) return false;
    if (state.career.closedTrackIds.includes(track.id)) return false;
    if (track.id === state.career.current?.trackId) return false;
    if (track.countryIds.length > 0 && !track.countryIds.includes(state.character.countryId)) {
      return false;
    }
    // Show one step above their level too, so there is something to aim at.
    return EDUCATION_ORDER.indexOf(track.requiredEducation as EducationStage) <= held + 1;
  });

  return rng
    .shuffle(reachable)
    .slice(0, 6)
    .map((track) => {
      const rung = track.rungs[0]!;
      const { lines, missing } = requirementsOf(state, track);
      const strength = strengthFor(state, track);
      return {
        trackId: track.id,
        title: rung.title,
        /*
         * The field it is in, not a company name — you are looking at a listing,
         * not an offer. Several ladders start on the same rung title
         * ("Apprentice"), so without this the list shows the same job twice.
         */
        employer: track.label === rung.title ? track.industry : track.label,
        /*
         * The company itself, for the interview. The list shows the kind of
         * place ("Mental Health Center"); the interview names it ("The Phillips
         * Group"), the way it works when you actually apply for something.
         */
        employerName: employerNameFor(track.industry, rng),
        // The listed wage is what this country actually pays for the work.
        salary: money(Math.round(rung.salary * wage)),
        salaryCents: Math.round(rung.salary * wage),
        industry: track.industry,
        requirements: lines,
        qualified: missing.length === 0,
        missing: missing[0] ?? null,
        // Meeting the bar is not the same as getting the job.
        chance: missing.length > 0 ? 0 : Math.min(0.92, 0.35 + strength * 0.55),
      };
    })
    .sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.salaryCents - a.salaryCents);
};

export interface ApplicationResult {
  state: LifeState;
  hired: boolean;
  line: string;
}

export const applyFor = (
  state: LifeState,
  trackId: string,
  content: ContentPack,
  config: GameConfig,
): ApplicationResult => {
  if (!state.character.alive) throw new ApplicationRejected('a dead character cannot work');
  if (state.activeEvent) throw new ApplicationRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new ApplicationRejected('not from in here');
  if (state.education.current && state.education.current.stage !== 'university') {
    throw new ApplicationRejected('you are still at school');
  }

  const opening = openings(state, content).find((o) => o.trackId === trackId);
  if (!opening) throw new ApplicationRejected('that job is not going any more');
  if (!opening.qualified) throw new ApplicationRejected(opening.missing ?? 'they turned you down');

  const applied = state.applicationsThisYear ?? 0;
  if (applied >= 3) throw new ApplicationRejected('you have applied for enough this year');

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'apply', trackId, state.character.age, applied);
    state.applicationsThisYear = applied + 1;
    state.step += 1;

    /*
     * Applying does not decide anything any more — it gets you an interview.
     *
     * The old version rolled the dice the instant you tapped the row, which is
     * why getting a job read as something that happened to you. Now there is a
     * question in the way, and the answer moves the odds; the qualifications
     * still decide most of it, and being turned down is still normal.
     */
    openInterview(state, opening, content, rng);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, hired: false, line: `${opening.employer} want to talk to you.` };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/**
 * Puts the character into a job. Used by the interview handler once the answer
 * has been rolled against, and nowhere else — the only other route into work is
 * `takeAvailableJob`, which is the floor under a player who never opens the tab.
 */
export const hireInto = (
  state: LifeState,
  trackId: string,
  employerName: string,
  salary: number,
  content: ContentPack,
): void => {
  const track = content.careersById.get(trackId);
  if (!track) return;
  const rung = track.rungs[0]!;

  if (state.career.current) {
    state.career.history.push({
      trackId: state.career.current.trackId,
      employerName: state.career.current.employerName,
      title: state.career.current.title,
      fromAge: state.character.age - state.career.current.yearsAtEmployer,
      toAge: state.character.age,
      endedBy: 'quit',
    });
  }

  state.career.current = {
    trackId: track.id,
    employerName,
    rungId: rung.id,
    title: rung.title,
    salary,
    yearsInRole: 0,
    yearsAtEmployer: 0,
    performance: 50,
    satisfaction: 62,
    rivalNpcId: null,
    managerNpcId: null,
  };
  state.career.retired = false;
  state.character.finances.salary = salary;
  state.yearsOutOfWork = 0;
};
