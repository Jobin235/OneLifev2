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
  /**
   * 0..100. Falls every year and faster with somebody living in it; decides
   * what the place is worth, what it lets for, and how long a tenant stays.
   */
  condition: z.number().int().min(0).max(100).default(90),
  /** Upgrades that raise the value, the rent, and what a tenant puts up with. */
  amenityIds: z.array(z.string()).default([]),
  /** Set while somebody is living in it and paying you for the privilege. */
  rental: z
    .object({
      tenantName: z.string(),
      tenantEmoji: z.string(),
      /** What they pay you a year, and what you are holding of theirs. */
      rentAnnual: MoneySchema,
      deposit: MoneySchema,
      sinceAge: z.number().int().min(0),
      /** 0..100. Falls with neglect and rent rises; a tenant who hates it leaves. */
      satisfaction: z.number().int().min(0).max(100),
      /** Years of rent they owe you. Two is a case; three is a disaster. */
      yearsUnpaid: z.number().int().min(0).default(0),
      /**
       * What they are actually like — hidden until you pay for a background
       * check, which is the whole point of paying for one.
       */
      character: z.enum(['careful', 'ordinary', 'trouble']),
      checked: z.boolean().default(false),
      /** One line about them, shown once you know it. */
      note: z.string().default(''),
    })
    .nullable()
    .default(null),
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
