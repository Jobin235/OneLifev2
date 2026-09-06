import { z } from 'zod';

/**
 * NPC templates are content. They describe the kind of person a context produces —
 * a classmate, a manager, a cousin's friend who asks a favour — not a specific one.
 */
export const NpcTemplateSchema = z.object({
  id: z.string().min(1),
  /** Relationship kind the spawned person starts in. */
  kind: z.string().min(1),
  /** Age relative to the player; a classmate is 0, a manager is +15. */
  ageOffset: z.tuple([z.number().int(), z.number().int()]),
  emojiPool: z.array(z.string()).min(1),
  /** One-line character reads, picked at random. */
  descriptors: z.array(z.string()).min(1),
  occupations: z.array(z.string()).default([]),
  /** Starting relationship dimensions before jitter. */
  dimensions: z.record(z.string(), z.number()).default({}),
  traitCount: z.number().int().min(0).max(3).default(1),
  /** Tier-1 people get real stats; a background classmate does not. */
  detailed: z.boolean().default(false),
});
export type NpcTemplate = z.infer<typeof NpcTemplateSchema>;
