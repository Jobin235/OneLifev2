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
  /**
   * The player's age when this person died, so the game can say how long ago.
   *
   * The NPC's own age at death is already recorded in `fated`; this is the
   * other half of it, and it is the half the player counts in. Null for
   * everybody still here, and for anyone who died before it was recorded.
   */
  diedAtPlayerAge: z.number().int().min(0).nullable().default(null),
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
  /**
   * What is currently wrong with them. Named, and it persists: the log says
   * "My mother has been diagnosed with sciatica" one year and "My mother is no
   * longer suffering from sciatica" three years later, and both lines are true
   * of the same stored fact rather than two unrelated pieces of flavour.
   */
  ailments: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        sinceAge: z.number().int().min(0),
        /**
         * Healed entries stay in the list. Dropping them let somebody catch
         * gallstones, recover, and catch gallstones again three years later,
         * which put the identical sentence in the log twice — a life having
         * patterns is fine, a life repeating itself verbatim reads as a bug.
         */
        healedAtAge: z.number().int().min(0).nullable().default(null),
      }),
    )
    .default([]),
  /** Set once they stop working, so the log does not retire them twice. */
  retired: z.boolean().default(false),
  /** Their partner, when they have one. Lets the log name them in later years. */
  spouseNpcId: z.string().nullable().default(null),
  /** Their employer, so "promoted to X at Y" stays consistent year to year. */
  employerName: z.string().nullable().default(null),
});
export type Npc = z.infer<typeof NpcSchema>;
