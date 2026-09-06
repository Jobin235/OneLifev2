import { z } from 'zod';

/** Stats, relationship dimensions and performance all live on the same 0..100 scale. */
export const STAT_MIN = 0;
export const STAT_MAX = 100;

export const StatValueSchema = z.number().int().min(STAT_MIN).max(STAT_MAX);
export type StatValue = z.infer<typeof StatValueSchema>;

/** Money is stored in whole minor units (cents) to keep arithmetic exact. */
export const MoneySchema = z.number().int().finite();
export type Money = z.infer<typeof MoneySchema>;

export const SexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof SexSchema>;

export const LifeStageSchema = z.enum([
  'early_childhood',
  'childhood',
  'teenage',
  'young_adult',
  'adult',
  'middle_age',
  'senior',
  'elder',
]);
export type LifeStage = z.infer<typeof LifeStageSchema>;

export const GameStateSchema = z.enum([
  'IDLE',
  'EVENT_AVAILABLE',
  'EVENT_ACTIVE',
  'CHOICE_PENDING',
  'PROCESSING',
  'LIFE_PROGRESSING',
  'LIFE_COMPLETE',
]);
export type GameState = z.infer<typeof GameStateSchema>;

export const clampStat = (n: number): number =>
  Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(n)));
