import { z } from 'zod';
import { StatValueSchema } from './primitives.js';

export const RelationshipKindSchema = z.enum([
  'mother',
  'father',
  'sibling',
  'child',
  'grandparent',
  'grandchild',
  'spouse',
  'partner',
  'ex',
  'friend',
  'best_friend',
  'classmate',
  'teacher',
  'colleague',
  'boss',
  'employee',
  'business_partner',
  'rival',
  'acquaintance',
  'cellmate',
  'in_law',
  /** Your sibling's children. They arrive on their own and grow up in the log. */
  'niece_nephew',
]);
export type RelationshipKind = z.infer<typeof RelationshipKindSchema>;

/**
 * Design 2A groups people by how close they are, not by category. The engine
 * derives the band; content never sets it directly.
 */
export const ClosenessBandSchema = z.enum(['close', 'around', 'drifted']);
export type ClosenessBand = z.infer<typeof ClosenessBandSchema>;

export const RelationshipDimensionsSchema = z.object({
  affection: StatValueSchema,
  trust: StatValueSchema,
  respect: StatValueSchema,
  conflict: StatValueSchema,
  closeness: StatValueSchema,
  romance: StatValueSchema,
  dependence: StatValueSchema,
});
export type RelationshipDimensions = z.infer<typeof RelationshipDimensionsSchema>;

/**
 * A memory is the unit that makes people feel like people.
 *
 * `factKey` is what the event engine queries years later ("did she once say she
 * would never relocate?"). `line` is what the player reads on the person's screen.
 * The two are written together so a stored fact can never drift from its story.
 */
export const MemorySchema = z.object({
  id: z.string(),
  /** The player character's age when this happened. Design 2B uses it as the gutter. */
  atAge: z.number().int().min(0),
  factKey: z.string().min(1),
  line: z.string().min(1),
  /** 0..100. Drives which memories survive into the person's summary. */
  weight: z.number().int().min(0).max(100),
  /** Structured payload the condition engine can read, e.g. { amount: 250000 }. */
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Set when a later event settles this fact, e.g. a debt finally repaid. */
  resolved: z.boolean().default(false),
});
export type Memory = z.infer<typeof MemorySchema>;

export const RelationshipSchema = z.object({
  npcId: z.string(),
  kind: RelationshipKindSchema,
  /** Kinds this person has held before, e.g. partner → ex → friend. */
  formerKinds: z.array(RelationshipKindSchema).default([]),
  dimensions: RelationshipDimensionsSchema,
  /** Player age when the relationship began. */
  sinceAge: z.number().int().min(0),
  /** Player age at last meaningful contact; drives drift. */
  lastContactAge: z.number().int().min(0),
  memories: z.array(MemorySchema),
  /** Design 2B "ON HER MIND" — what this person is working up to. */
  onTheirMind: z.string().nullable(),
  /** Rendered subtitle fact, e.g. "owes you $2,500". Derived, never authored. */
  subtitle: z.string(),
  band: ClosenessBandSchema,
});
export type Relationship = z.infer<typeof RelationshipSchema>;
