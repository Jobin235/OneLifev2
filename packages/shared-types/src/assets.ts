import { z } from 'zod';
import { MoneySchema, StatValueSchema } from './primitives.js';

export const AssetKindSchema = z.enum([
  'house',
  'apartment',
  'car',
  'investment',
  'collectible',
  'luxury',
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  kind: AssetKindSchema,
  /** "House on Alder St" — design 3C names things rather than listing SKUs. */
  label: z.string(),
  emoji: z.string(),
  value: MoneySchema,
  loanOutstanding: MoneySchema,
  annualCost: MoneySchema,
  acquiredAtAge: z.number().int().min(0),
  /** Sentimental weight: the childhood home is not just its market value. */
  meaning: z.string().nullable(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const BusinessSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  industry: z.string(),
  cityId: z.string(),
  foundedAtAge: z.number().int().min(0),
  /** Player's share, 0..100. */
  equity: z.number().int().min(0).max(100),
  annualRevenue: MoneySchema,
  annualCosts: MoneySchema,
  employees: z.number().int().min(0),
  /** Cumulative headcount over the business's life; design 4C reports it as legacy. */
  lifetimeEmployees: z.number().int().min(0),
  reputation: StatValueSchema,
  growth: z.number().int().min(-100).max(100),
  debt: MoneySchema,
  /** Named units the player can actually picture: "6 vans", "2 locations". */
  unitLabel: z.string(),
  units: z.number().int().min(0),
  /** Which world signals this business is exposed to, e.g. ['fuel','wages']. */
  exposures: z.array(z.string()).default([]),
  closed: z.boolean().default(false),
});
export type Business = z.infer<typeof BusinessSchema>;
