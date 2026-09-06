import type { EducationStage, LifeState } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import type { Rng } from './rng.js';

export const GRADE_LETTERS: Array<[number, string]> = [
  [385, 'A'],
  [355, 'A−'],
  [320, 'B+'],
  [285, 'B'],
  [250, 'B−'],
  [215, 'C+'],
  [180, 'C'],
  [145, 'C−'],
  [110, 'D+'],
  [75, 'D'],
  [0, 'F'],
];

export const gradeLetter = (points: number): string =>
  GRADE_LETTERS.find(([floor]) => points >= floor)?.[1] ?? 'F';

export const gpa = (points: number): string => (points / 100).toFixed(1);

export const STAGE_LABEL: Record<EducationStage, string> = {
  none: 'No schooling',
  primary: 'Primary school',
  secondary: 'High school',
  vocational: 'Trade school',
  university: 'University',
  graduate: 'Graduate school',
};

/**
 * A year of school. Grades track smarts and discipline plus whatever the player
 * spent actions on; nobody fails by accident, but nobody coasts to an A either.
 */
export const advanceEducationYear = (state: LifeState, rng: Rng): void => {
  const enrolment = state.education.current;
  if (!enrolment) return;

  const { stats, hidden } = state.character;
  const natural = stats.smarts * 2.2 + hidden.discipline * 1.4;
  enrolment.gradePoints = Math.round(
    Math.max(0, Math.min(400, enrolment.gradePoints * 0.6 + natural * 0.4 + rng.jitter() * 25)),
  );

  for (const subject of enrolment.subjects) {
    subject.gradePoints = Math.round(
      Math.max(0, Math.min(400, enrolment.gradePoints + rng.jitter() * 70)),
    );
  }

  // School is where smarts actually grow.
  stats.smarts = clampStat(stats.smarts + (enrolment.gradePoints > 250 ? 1.8 : 0.8));

  enrolment.yearIndex += 1;
};

export const isGraduating = (state: LifeState): boolean => {
  const e = state.education.current;
  return !!e && e.yearIndex > e.totalYears;
};

export const graduate = (state: LifeState, completed: boolean): void => {
  const e = state.education.current;
  if (!e) return;

  state.education.history.push({
    stage: e.stage,
    institutionName: e.institutionName,
    major: e.major,
    fromAge: state.character.age - (e.yearIndex - 1),
    toAge: state.character.age,
    completed,
    finalGradePoints: e.gradePoints,
  });

  if (completed) {
    const order: EducationStage[] = ['none', 'primary', 'secondary', 'vocational', 'university', 'graduate'];
    if (order.indexOf(e.stage) > order.indexOf(state.education.highestCompleted)) {
      state.education.highestCompleted = e.stage;
    }
  }
  state.education.current = null;
};

export const meetsEducation = (state: LifeState, required: EducationStage | 'none'): boolean => {
  const order: EducationStage[] = ['none', 'primary', 'secondary', 'vocational', 'university', 'graduate'];
  return order.indexOf(state.education.highestCompleted) >= order.indexOf(required as EducationStage);
};
