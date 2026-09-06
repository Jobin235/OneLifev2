import type { CountryPack, LifeState } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import type { Rng } from './rng.js';

/**
 * Health is not a management minigame (spec §29). Its whole job is to produce the
 * moments on design 5F: a warning you can ignore at 38, and a bill at 71.
 */
export const CONDITION_CATALOGUE = [
  { id: 'high_blood_pressure', label: 'High blood pressure', minAge: 32, drain: 1.4, base: 0.05 },
  { id: 'type_2_diabetes', label: 'Type 2 diabetes', minAge: 38, drain: 1.8, base: 0.035 },
  { id: 'bad_back', label: 'A back that never came right', minAge: 30, drain: 0.8, base: 0.04 },
  { id: 'anxiety', label: 'Anxiety', minAge: 16, drain: 0.6, base: 0.045 },
  { id: 'bad_knee', label: 'A knee that never came right', minAge: 20, drain: 0.7, base: 0.03 },
  { id: 'heart_disease', label: 'Heart disease', minAge: 50, drain: 2.6, base: 0.04 },
] as const;

/**
 * Countries with strong screening catch things early whether or not the player
 * chose to look — design 4A's "you'd have been treated at 38, too."
 */
export const rollNewConditions = (
  state: LifeState,
  country: CountryPack,
  rng: Rng,
): Array<{ id: string; label: string; treated: boolean }> => {
  const found: Array<{ id: string; label: string; treated: boolean }> = [];
  const { character } = state;

  for (const candidate of CONDITION_CATALOGUE) {
    if (character.age < candidate.minAge) continue;
    if (character.conditions.some((c) => c.id === candidate.id)) continue;

    const healthPenalty = Math.max(0, (60 - character.stats.health) / 420);
    const fitnessPenalty = Math.max(0, (55 - character.stats.fitness) / 500);
    const habitPenalty = character.habitIds.length * 0.006;
    const agePressure = Math.max(0, (character.age - candidate.minAge) / 900);

    const chance = candidate.base * 0.35 + healthPenalty + fitnessPenalty + habitPenalty + agePressure;
    if (!rng.chance(Math.min(0.07, chance))) continue;

    const screened =
      country.healthcare.screening === 'strong'
        ? rng.chance(0.8)
        : country.healthcare.screening === 'basic'
          ? rng.chance(0.35)
          : false;

    character.conditions.push({
      id: candidate.id,
      label: candidate.label,
      diagnosedAtAge: character.age,
      treated: screened,
      annualHealthDrain: candidate.drain,
    });
    found.push({ id: candidate.id, label: candidate.label, treated: screened });
  }
  return found;
};

/** What a procedure actually costs this character, after their country's system. */
export const outOfPocket = (listPriceCents: number, country: CountryPack): number =>
  Math.round(listPriceCents * country.healthcare.patientShare);

export const isAvailable = (procedureId: string, country: CountryPack): boolean =>
  !country.healthcare.unavailable.includes(procedureId);

/** The honest history card on 5F, written from what actually happened. */
export const bodyHistoryLines = (state: LifeState): string[] => {
  const lines: string[] = [];
  for (const condition of state.character.conditions) {
    const years = state.character.age - condition.diagnosedAtAge;
    lines.push(
      condition.treated
        ? `${condition.label} since ${condition.diagnosedAtAge}, treated.`
        : `${condition.label} since ${condition.diagnosedAtAge}, untreated for ${years} year${years === 1 ? '' : 's'}.`,
    );
  }
  if (state.character.habitIds.includes('smoking')) lines.push('You smoked for years.');
  return lines;
};

export const treat = (state: LifeState, conditionId: string): void => {
  const condition = state.character.conditions.find((c) => c.id === conditionId);
  if (condition) {
    condition.treated = true;
    state.character.stats.health = clampStat(state.character.stats.health + 3);
  }
};
