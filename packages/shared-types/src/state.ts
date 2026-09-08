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
import { RoyalStandingSchema } from './royalty.js';
import { EscapeGameSchema } from './escape.js';
import { MobStandingSchema } from './mob.js';
import { VentureSchema } from './venture.js';
import { VigilanteSchema } from './vigilante.js';
import { WorldIndicatorsSchema } from './world.js';

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
  /**
   * A title, when there is one. Null for the overwhelming majority of lives,
   * which is the honest shape: royalty is not a career you can choose into.
   */
  royal: RoyalStandingSchema.nullable().default(null),
  /**
   * The maze, while one is on screen. Held in the save rather than in the
   * client so a half-finished escape survives closing the app — and so the
   * server, not the browser, decides where the guard is.
   */
  escape: EscapeGameSchema.nullable().default(null),
  /**
   * Who you answer to, when you answer to anybody. Null for almost everybody,
   * and there is no resigning from it.
   */
  mob: MobStandingSchema.nullable().default(null),
  /**
   * Things you own and run: a commune, a zoo, a front for a spy agency. One of
   * each at most, which is why this is a list rather than three fields.
   */
  ventures: z.array(VentureSchema).default([]),
  /** The other life, when there is one. */
  vigilante: VigilanteSchema.nullable().default(null),
  /**
   * How much the character has been looking after themselves lately, 0..8 each.
   *
   * Topped up when they train, study or take care of how they come across, and
   * bled off every year. The drifting stats read it as the target they move
   * toward, which is what stops fitness sliding to nothing and smarts and charm
   * pinning at the ceiling — see packages/simulation/src/aging.ts.
   */
  recentActivity: z
    .object({
      fitness: z.number().min(0).max(8).default(0),
      study: z.number().min(0).max(8).default(0),
      charm: z.number().min(0).max(8).default(0),
    })
    .default({ fitness: 0, study: 0, charm: 0 }),
  /**
   * The world this life is being lived in, as it stood at the last age-up.
   *
   * The authoritative world is global and lives on the server — this is the
   * copy the life was measured against, kept so the next year can say what
   * *changed*. A client with no server ticks it itself, which is how the
   * offline build has weather at all.
   */
  world: z
    .object({ indicators: WorldIndicatorsSchema, tick: z.number().int().min(0).default(0) })
    .nullable()
    .default(null),
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
  /** chronicleLineId → the age it last appeared, so a life does not repeat itself. */
  chronicleLog: z.record(z.string(), z.number().int()),
  /** "npcId:interactionId" → times used this year. Cleared on age-up. */
  interactionUsage: z.record(z.string(), z.number().int().min(0)),
  /**
   * Shares held, and what was paid for them.
   *
   * Prices are not stored: they are a deterministic walk from the world's start,
   * so the market needs no state of its own and two players in the same year see
   * the same board.
   */
  portfolio: z
    .array(
      z.object({
        stockId: z.string(),
        shares: z.number().int().min(0),
        /** Cost basis in cents, so a sale can report a real profit or loss. */
        spent: z.number().int().min(0),
      }),
    )
    .default([]),
  /** Ribbon ids earned by this line so far — what carries between lives. */
  ribbonsEarned: z.array(z.string()),
  /**
   * Deaths this life has already witnessed, and the age and cause they happened
   * at.
   *
   * This is the Time Machine's one rule with teeth: rewinding past somebody's
   * death does not save them. They stay alive until that year comes round again
   * and then die of the same thing, at the same age. The ledger is knowledge
   * that survives time travel, so it is carried across a rewind rather than
   * rolled back with everything else.
   */
  fated: z
    .array(
      z.object({
        npcId: z.string(),
        atAge: z.number().int().min(0),
        cause: z.string(),
      }),
    )
    .default([]),
  /** Consecutive years an adult has been out of work. Drives desperation. */
  yearsOutOfWork: z.number().int().min(0),
  /** Whether costs are currently going uncovered, so only the change is logged. */
  struggling: z.boolean(),
  /** Consecutive years contradicting `struggling`; two flips it. */
  struggleYears: z.number().int().min(0),
  /** Applications made this year. Cleared on age-up. */
  applicationsThisYear: z.number().int().min(0),

  /** For the return-diff engine; never shown to the player (§88). */
  lastSeenWorldSnapshotId: z.string().nullable(),
  lastReturnEventAt: z.string().nullable(),

  legacy: LegacySchema.nullable(),
});
export type LifeState = z.infer<typeof LifeStateSchema>;

/**
 * 2: replaced the global per-year action budget with per-activity annual limits.
 * 3: added the chronicle (decision-free log lines) and its per-line cooldowns.
 * 4: added per-person interactions and their annual limits.
 * 5: added ribbons, and the set the family line has collected.
 * 6-7: added a stated life goal, then removed it. See docs/COMPETITIVE-RESEARCH.md.
 * 8: added a royal standing — a title, a house, respect, and a place in line.
 * 9: added the prison maze and a place in an organisation that has no exit.
 * 10: added ventures — a commune, a zoo, an agency — and the vampire.
 * 11: added the other life: a mask, a name the city gives it, and suspicion.
 * 12: added the habit record the drifting stats aim at.
 * There is no migration path; an older save is discarded rather than loaded.
 */
export const SCHEMA_VERSION = 13;
