import { z } from 'zod';
import { SexSchema, StatValueSchema } from './primitives.js';
import { StatsSchema } from './character.js';

/**
 * Simulation tiers (spec §24). Tier is derived from the relationship band each
 * age-up, so a background classmate can become a tier-1 spouse without any
 * special-casing — and a spouse can drift back down.
 */
export const NpcTierSchema = z.enum(['tier1', 'tier2', 'tier3']);
export type NpcTier = z.infer<typeof NpcTierSchema>;

export const NpcSchema = z.object({
  id: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  sex: SexSchema,
  age: z.number().int().min(0).max(140),
  alive: z.boolean(),
  avatarEmoji: z.string(),
  tier: NpcTierSchema,
  /** One-line character read: "Quick, stubborn, keeps score". */
  descriptor: z.string(),
  traitIds: z.array(z.string()),
  occupation: z.string().nullable(),
  cityId: z.string(),
  /** Tier-1 NPCs (children especially, design 5G) carry real stats. */
  stats: StatsSchema.nullable(),
  /** Tier-1 only: how well off they are, for money-shaped events. */
  wealth: StatValueSchema.nullable(),
  /** Set for the player's own children so succession can rank them. */
  isBloodline: z.boolean().default(false),
  parentNpcIds: z.array(z.string()).default([]),
});
export type Npc = z.infer<typeof NpcSchema>;
