import type { GameConfig } from '@lineage/config';
import type { CareerTrack, LifeState, PerformanceBand } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
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
};

export const jobLine = (state: LifeState): string => {
  if (state.character.record.incarceration) return 'Incarcerated';
  if (state.career.retired) return 'Retired';
  const owned = state.businesses.find((b) => !b.closed && b.equity >= 50);
  if (owned) return `Owner, ${owned.name}`;
  const job = state.career.current;
  if (job) return `${job.title}, ${job.employerName}`;
  if (state.education.current) return state.education.current.institutionName;
  if (state.character.age < 16) return 'At school';
  return 'Not working';
};
