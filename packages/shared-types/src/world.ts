import { z } from 'zod';

/**
 * World variables are indices, not currencies. 100 is "normal". The player never
 * sees any of this (design: there is no World tab) — it only ever reaches them as
 * an ordinary life card, and only when they own something it touches.
 */
export const WorldIndicatorsSchema = z.object({
  inflation: z.number(),
  interestRates: z.number(),
  employment: z.number(),
  housingCost: z.number(),
  fuel: z.number(),
  food: z.number(),
  wages: z.number(),
  businessConditions: z.number(),
  consumerSpending: z.number(),
  /** Non-economic pressure that gates disaster/politics/health content. */
  politicalTension: z.number(),
  publicHealth: z.number(),
  technologyPace: z.number(),
});
export type WorldIndicators = z.infer<typeof WorldIndicatorsSchema>;

export const WORLD_SIGNAL_KEYS = Object.keys(
  WorldIndicatorsSchema.shape,
) as (keyof WorldIndicators)[];

export const WorldEventSchema = z.object({
  id: z.string(),
  kind: z.enum(['economy', 'politics', 'society', 'technology', 'environment', 'global']),
  /** Internal label. Never shown verbatim; content phrases it in the player's terms. */
  label: z.string(),
  startedTick: z.number().int(),
  endsTick: z.number().int().nullable(),
  /** Which indicators this pushes, and by how much per tick. */
  pressure: z.record(z.string(), z.number()).default({}),
  severity: z.number().int().min(0).max(100),
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;

export const WorldSnapshotSchema = z.object({
  id: z.string(),
  tick: z.number().int().min(0),
  capturedAt: z.string(),
  indicators: WorldIndicatorsSchema,
  activeEvents: z.array(WorldEventSchema),
});
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;

/** Output of the return-diff engine (spec §89). */
export const WorldDeltaSchema = z.object({
  signal: z.string(),
  from: z.number(),
  to: z.number(),
  /** Signed fractional change, e.g. 0.18 for +18%. */
  pctChange: z.number(),
  significance: z.enum(['ignore', 'minor', 'meaningful', 'major']),
});
export type WorldDelta = z.infer<typeof WorldDeltaSchema>;
