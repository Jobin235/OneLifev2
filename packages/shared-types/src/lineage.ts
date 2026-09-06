import { z } from 'zod';
import { MoneySchema } from './primitives.js';

/**
 * The game's title mechanic. A life does not end at a "start new life" button —
 * you carry on as someone who was in the last one (design 4C).
 */
export const AncestorSchema = z.object({
  name: z.string(),
  bornYear: z.number().int(),
  diedYear: z.number().int(),
  age: z.number().int(),
  epitaph: z.string(),
  /** Estate actually transferred to this generation, after splits and debts. */
  estatePassedOn: MoneySchema,
  notableIds: z.array(z.string()).default([]),
});
export type Ancestor = z.infer<typeof AncestorSchema>;

export const LineageSchema = z.object({
  id: z.string(),
  familyName: z.string(),
  generation: z.number().int().min(1),
  ancestors: z.array(AncestorSchema).default([]),
  /** Things that outlive a single life and can be inherited or discovered. */
  heirlooms: z
    .array(z.object({ id: z.string(), label: z.string(), emoji: z.string(), fromGeneration: z.number().int() }))
    .default([]),
  /** Institutions the family created: a scholarship, a company, an ordinance. */
  institutions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        emoji: z.string(),
        foundedGeneration: z.number().int(),
        /** Still running? A scholarship funded for 60 years outlives its founder. */
        endsInYear: z.number().int().nullable(),
      }),
    )
    .default([]),
});
export type Lineage = z.infer<typeof LineageSchema>;
