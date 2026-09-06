import { z } from 'zod';

/**
 * Traits are content, not code. The simulation only knows a trait's id and its
 * declared numeric influences; content defines what traits exist.
 */
export const TraitPolaritySchema = z.enum(['positive', 'negative', 'neutral']);

export const TraitDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  polarity: TraitPolaritySchema.default('neutral'),
  /** Opposing traits can never be held simultaneously. */
  conflictsWith: z.array(z.string()).default([]),
  /** Additive nudges applied at character creation, on the 0..100 stat scale. */
  statBias: z.record(z.string(), z.number()).default({}),
  /** Multiplies the base weight of matching event categories during selection. */
  eventAffinity: z.record(z.string(), z.number()).default({}),
});
export type TraitDefinition = z.infer<typeof TraitDefinitionSchema>;
