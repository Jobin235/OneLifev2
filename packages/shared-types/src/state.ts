import { z } from 'zod';
import { GameStateSchema } from './primitives.js';
import { CharacterSchema } from './character.js';
import { NpcSchema } from './npc.js';
import { RelationshipSchema } from './relationship.js';
import { CareerStateSchema } from './career.js';
import { EducationStateSchema } from './education.js';
import { AssetSchema, BusinessSchema } from './assets.js';
import { EventInstanceSchema, ScheduledEventSchema } from './event.js';
import { HistoryEntrySchema, LegacySchema } from './history.js';
import { LineageSchema } from './lineage.js';

export const FlagValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type FlagValue = z.infer<typeof FlagValueSchema>;

/**
 * The whole of one life, and the only thing the simulation mutates.
 *
 * It is a value: `advanceYear(state, …)` returns a new one rather than editing in
 * place, which is what makes replay from `seed` + choice history possible (§125).
 */
export const LifeStateSchema = z.object({
  id: z.string(),
  /** Deterministic root seed. Everything random derives from this (§68). */
  seed: z.string(),
  /** Monotonic counter mixed into every roll so no two draws collide. */
  step: z.number().int().min(0),
  schemaVersion: z.number().int().min(1),
  contentVersion: z.number().int().min(1),

  lineage: LineageSchema,
  character: CharacterSchema,
  npcs: z.array(NpcSchema),
  relationships: z.array(RelationshipSchema),
  career: CareerStateSchema,
  education: EducationStateSchema,
  assets: z.array(AssetSchema),
  businesses: z.array(BusinessSchema),

  /** Arbitrary durable booleans/numbers set by events, read by conditions (§103). */
  flags: z.record(z.string(), FlagValueSchema),

  history: z.array(HistoryEntrySchema),
  /** Ids of history entries created during the current life year (design 1A). */
  currentYearEntryIds: z.array(z.string()),

  gameState: GameStateSchema,
  /** The card on screen. Age Up is blocked while this is set (design 1A). */
  activeEvent: EventInstanceSchema.nullable(),
  /** Resolved this year but not yet dismissed. */
  resolvedEvent: EventInstanceSchema.nullable(),
  pending: z.array(ScheduledEventSchema),

  /** definitionId → life ages at which it fired, for cooldowns and caps (§20, §108). */
  eventLog: z.record(z.string(), z.array(z.number().int())),
  /** category → ages, for the similarity penalty that keeps variety (§108). */
  categoryLog: z.record(z.string(), z.array(z.number().int())),

  /**
   * activityId → how many times it has been done this life year. Cleared on
   * every age-up. Each activity carries its own annual limit; there is no
   * global budget.
   */
  activityUsage: z.record(z.string(), z.number().int().min(0)),

  /** For the return-diff engine; never shown to the player (§88). */
  lastSeenWorldSnapshotId: z.string().nullable(),
  lastReturnEventAt: z.string().nullable(),

  legacy: LegacySchema.nullable(),
});
export type LifeState = z.infer<typeof LifeStateSchema>;

/**
 * 2: replaced the global per-year action budget with per-activity annual limits.
 * A saved life from version 1 has no `activityUsage` and cannot be resumed.
 */
export const SCHEMA_VERSION = 2;
