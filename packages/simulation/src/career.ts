import type { GameConfig } from '@lineage/config';
import type { CareerTrack, Enrolment, LifeState, PerformanceBand } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { pushHistory } from './history.js';
import type { Rng } from './rng.js';

export const performanceBand = (performance: number): PerformanceBand => {
  if (performance >= 85) return 'outstanding';
  if (performance >= 65) return 'strong';
  if (performance >= 40) return 'fine';
  return 'struggling';
};

export const PERFORMANCE_LABEL: Record<PerformanceBand, string> = {
  struggling: 'Struggling',
  fine: 'Fine',
  strong: 'Strong',
  outstanding: 'Outstanding',
};

/**
 * A year at work. Performance drifts toward what the character actually is — a
 * disciplined, clever person converges high whatever they started at — with enough
 * noise that two identical characters diverge.
 */
export const advanceCareerYear = (state: LifeState, config: GameConfig, rng: Rng): void => {
  const job = state.career.current;
  if (!job) return;

  const { stats, hidden } = state.character;
  const natural = clampStat(hidden.discipline * 0.45 + stats.smarts * 0.35 + stats.charm * 0.2);
  const inertia = config.career.performanceInertia;

  job.performance = clampStat(job.performance * inertia + natural * (1 - inertia) + rng.jitter() * 4);

  job.yearsInRole += 1;
  job.yearsAtEmployer += 1;
  state.career.totalExperience += 1;

  // Staying put gets you a small raise; the ladder gets you a real one.
  state.character.finances.salary = Math.round(
    state.character.finances.salary * (1 + config.career.stayingRaise),
  );
  job.salary = state.character.finances.salary;

  // Satisfaction decays without movement, which is what makes "Look elsewhere" tempt.
  const stagnation = Math.max(0, job.yearsInRole - 4);
  job.satisfaction = clampStat(job.satisfaction - stagnation * 1.5 + rng.jitter() * 2);
};

export const nextRung = (track: CareerTrack, currentRungId: string) => {
  const index = track.rungs.findIndex((r) => r.id === currentRungId);
  if (index < 0 || index >= track.rungs.length - 1) return null;
  return track.rungs[index + 1] ?? null;
};

export const isPromotable = (state: LifeState, track: CareerTrack, config: GameConfig): boolean => {
  const job = state.career.current;
  if (!job || state.career.retired) return false;
  const next = nextRung(track, job.rungId);
  if (!next) return false;
  return (
    job.yearsInRole >= Math.max(config.career.promotionMinYearsInRole, 1) &&
    job.performance >= next.minPerformance &&
    state.career.totalExperience >= next.minExperience
  );
};

export const promote = (state: LifeState, track: CareerTrack): boolean => {
  const job = state.career.current;
  if (!job) return false;
  const next = nextRung(track, job.rungId);
  if (!next) return false;

  job.rungId = next.id;
  job.title = next.title;
  job.salary = next.salary;
  job.yearsInRole = 0;
  job.satisfaction = clampStat(job.satisfaction + 18);
  state.character.finances.salary = next.salary;
  return true;
};

export const leaveJob = (
  state: LifeState,
  reason: 'quit' | 'fired' | 'laid_off' | 'retired' | 'imprisoned' | 'died',
): void => {
  const job = state.career.current;
  if (!job) return;

  state.career.history.push({
    trackId: job.trackId,
    employerName: job.employerName,
    title: job.title,
    fromAge: state.character.age - job.yearsAtEmployer,
    toAge: state.character.age,
    endedBy: reason,
  });
  state.career.current = null;
  state.character.finances.salary = 0;
  if (reason === 'retired') state.career.retired = true;

  /*
   * Say it out loud. Losing a job used to happen silently — the header simply
   * went blank and the log said nothing — which made employment look like it
   * came and went at random when in fact something specific had happened.
   */
  // Some employers are called "Ashwell & Co." — do not give them two full stops.
  const employer = job.employerName;
  const stop = employer.endsWith('.') ? '' : '.';
  const said: Record<typeof reason, string> = {
    quit: `You left ${employer}${stop}`,
    fired: `You were fired from ${employer}${stop}`,
    laid_off: `${employer} let you go.`,
    retired: `You retired from ${employer}${stop}`,
    imprisoned: `You lost your job at ${employer} when you went inside.`,
    died: `You were still working at ${employer}${stop}`,
  };
  const icon: Record<typeof reason, string> = {
    quit: '🚪', fired: '📦', laid_off: '📉', retired: '🎣', imprisoned: '⚖️', died: '💼',
  };
  pushHistory(state, 'career', icon[reason], said[reason], reason === 'retired' ? 70 : 50);
};

export const jobLine = (state: LifeState): string => {
  if (state.character.record.incarceration) return 'Incarcerated';
  if (state.career.retired) return 'Retired';
  const owned = state.businesses.find((b) => !b.closed && b.equity >= 50);
  if (owned) return `Owner, ${owned.name}`;
  const job = state.career.current;
  if (job) return `${job.title}, ${job.employerName}`;
  if (state.education.current) return state.education.current.institutionName;
  if (state.character.age < 5) return 'Too young for any of this';
  if (state.character.age < 18) return 'At school';
  return 'Not working';
};

/**
 * The one line under your name in the header, BitLife-style: a station, not a
 * sentence. "University Student", "Apprentice Moonshiner", "Unemployed",
 * "Prisoner". It is the shortest true answer to "what are you right now".
 */
export const stationLine = (state: LifeState): string => {
  if (state.character.record.incarceration) return 'Prisoner';
  /*
   * A title outranks a job, and outranks retirement. A king who happens to own
   * a haulage firm is not "Owner, Olsen Hauling" to anybody, including himself.
   * Prison still wins: it outranks everything, which is rather the point of it.
   */
  if (state.royal) return state.royal.title;
  if (state.career.retired) return 'Retired';
  const owned = state.businesses.find((b) => !b.closed && b.equity >= 50);
  if (owned) return `Owner, ${owned.name}`;
  if (state.career.current) return state.career.current.title;
  const enrolled = state.education.current;
  if (enrolled) return STATION_BY_STAGE[enrolled.stage];
  /*
   * Below a real job and below school, because a soldier with a day job has a
   * day job and that is rather the point of having one — but above
   * "Unemployed", which is not what somebody who works three jobs a year for
   * the Vitale family is.
   */
  if (state.mob) return state.mob.title;
  if (state.character.age < 2) return 'Baby';
  if (state.character.age < 5) return 'Toddler';
  return 'Unemployed';
};

const STATION_BY_STAGE: Record<Enrolment['stage'], string> = {
  none: 'Unemployed',
  primary: 'Elementary School Student',
  secondary: 'High School Student',
  vocational: 'Trade School Student',
  university: 'University Student',
  graduate: 'Graduate Student',
};

/**
 * Which of the five nav slots the contextual first one is showing. School wins
 * over work because you cannot do both, and prison wins over everything.
 */
export const navSlot = (state: LifeState): 'school' | 'occupation' | 'prison' => {
  if (state.character.record.incarceration) return 'prison';
  if (state.education.current) return 'school';
  // A child who is not enrolled yet is still on the school track, not looking
  // for work. Showing them "Occupation" would be the app telling a five-year-old
  // to get a job.
  if (state.character.age < 18 && !state.career.current) return 'school';
  return 'occupation';
};
