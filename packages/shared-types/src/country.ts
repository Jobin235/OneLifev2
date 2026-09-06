import { z } from 'zod';
import { MoneySchema } from './primitives.js';

/**
 * Design 4A promises that where you are born changes healthcare, education, law
 * and family expectation. A country pack is the data behind that promise; core
 * simulation code must never branch on a country id directly (spec §114).
 */
export const CountryPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  flag: z.string().min(1),
  region: z.enum(['Asia', 'Africa', 'Europe', 'Americas', 'Middle East', 'Oceania']),
  /** Weight used by the "Anywhere at all" roll — real population share. */
  populationWeight: z.number().min(0),
  cities: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        /** Multiplier on national baseline cost of living. */
        costOfLiving: z.number().min(0.1).max(5),
        /** 0..100; drives crime opportunity and policing content. */
        crime: z.number().int().min(0).max(100),
        opportunity: z.number().int().min(0).max(100),
        blurb: z.string(),
      }),
    )
    .min(1),
  /** The one-line promises shown on the birthplace card. */
  changes: z.array(z.object({ icon: z.string(), text: z.string() })).default([]),
  healthcare: z.object({
    /** Share of a medical bill the player pays, 0..1. */
    patientShare: z.number().min(0).max(1),
    /** Whether routine conditions get caught early without the player choosing to. */
    screening: z.enum(['none', 'basic', 'strong']),
    /** Procedures simply not available where they live. */
    unavailable: z.array(z.string()).default([]),
  }),
  education: z.object({
    universityCost: MoneySchema,
    /** A single exam at 18 that gates university (design 4A, Việt Nam). */
    entranceExam: z.boolean(),
    compulsoryUntilAge: z.number().int().min(0),
  }),
  law: z.object({
    drinkingAge: z.number().int().min(0),
    marriageAge: z.number().int().min(0),
    /** 0..100: how hard police look. Scales crime "caught" odds. */
    enforcement: z.number().int().min(0).max(100),
    /** Multiplier on how much a conviction closes off afterwards. */
    convictionCost: z.number().min(0).max(3),
    militaryService: z.boolean().default(false),
  }),
  family: z.object({
    /** 0..100: how much refusing to house ageing parents costs you. */
    expectationToHouseParents: z.number().int().min(0).max(100),
    typicalSiblings: z.number().int().min(0).max(8),
  }),
  /** Career tracks available here on top of the universal set. */
  extraTrackIds: z.array(z.string()).default([]),
  /** Baseline national salary multiplier vs. the content's reference figures. */
  wageMultiplier: z.number().min(0.05).max(5),
  /** Sport ladder that exists here — football in Portland, cricket in Karachi (5B). */
  nationalSportTrackId: z.string().nullable().default(null),
  surnames: z.array(z.string()).min(1),
  firstNames: z.object({ male: z.array(z.string()).min(1), female: z.array(z.string()).min(1) }),
});
export type CountryPack = z.infer<typeof CountryPackSchema>;

export const UPBRINGING_IDS = ['rough', 'getting_by', 'comfortable'] as const;
export const UpbringingSchema = z.enum(UPBRINGING_IDS);
export type Upbringing = z.infer<typeof UpbringingSchema>;
