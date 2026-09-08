import { z } from 'zod';
import { MoneySchema, SexSchema, StatValueSchema } from './primitives.js';

/**
 * The five stats the player actually sees, in header order.
 * Design 1A shows exactly these, with fixed icons and colours.
 */
export const StatsSchema = z.object({
  health: StatValueSchema,
  happiness: StatValueSchema,
  smarts: StatValueSchema,
  fitness: StatValueSchema,
  charm: StatValueSchema,
});
export type Stats = z.infer<typeof StatsSchema>;
export const STAT_KEYS = Object.keys(StatsSchema.shape) as (keyof Stats)[];

export const STAT_DISPLAY: Record<keyof Stats, { icon: string; label: string; color: string }> = {
  health: { icon: '❤️', label: 'Health', color: '#E2563C' },
  happiness: { icon: '😊', label: 'Happiness', color: '#E9A93B' },
  smarts: { icon: '🧠', label: 'Smarts', color: '#7B6BD6' },
  fitness: { icon: '💪', label: 'Fitness', color: '#2FA97C' },
  charm: { icon: '😎', label: 'Charm', color: '#DB6C9B' },
};

/**
 * Never surfaced in the UI. These bias event selection and outcomes so that two
 * characters with identical visible stats still live different lives.
 */
export const HiddenAttributesSchema = z.object({
  discipline: StatValueSchema,
  creativity: StatValueSchema,
  luck: StatValueSchema,
});
export type HiddenAttributes = z.infer<typeof HiddenAttributesSchema>;

/**
 * Something you owe, to somebody, for a reason.
 *
 * A single `debt` number could not answer "to whom, and what for", which made
 * every balance look arbitrary — and there was no way to pay it off, so an $800
 * scrape at seventeen compounded quietly for the rest of the life.
 */
export const DebtSchema = z.object({
  id: z.string(),
  /** "Student loan", "Mortgage on the flat", "Court fine". */
  label: z.string().min(1),
  /** Who holds it: "the government", "Northgate Bank", "your brother". */
  holder: z.string().min(1),
  balance: MoneySchema,
  /**
   * What was borrowed. Kept so the balance can be capped at it: a student loan
   * repaid out of income can accrue faster than it is paid, and without a
   * ceiling a degree becomes a debt that only ever grows.
   */
  originalAmount: MoneySchema.default(0),
  /** Annual interest, as a fraction. 0 for an interest-free family loan. */
  rate: z.number().min(0).max(1),
  takenAtAge: z.number().int().min(0),
});
export type Debt = z.infer<typeof DebtSchema>;

export const FinancesSchema = z.object({
  /** Liquid money. Design 3C shows one "what you're worth" figure built from these. */
  cash: MoneySchema,
  savings: MoneySchema,
  /**
   * What the share portfolio was worth at the last valuation.
   *
   * Written by the market and read by net worth, because prices need the
   * content pack and the world, and the finance layer has neither. It is also
   * the honest figure: what anybody actually knows a portfolio is worth is what
   * it was worth the last time they looked.
   */
  investments: MoneySchema.default(0),
  /** Total owed. Derived from `debts`; never written directly. */
  debt: MoneySchema,
  debts: z.array(DebtSchema).default([]),
  /** Gross annual salary; 0 when unemployed. */
  salary: MoneySchema,
  /** Annual non-salary income: business distributions, pension, brand deals. */
  otherIncome: MoneySchema,
  /** Annual cost of living from location, assets and dependents. */
  annualExpenses: MoneySchema,
});
export type Finances = z.infer<typeof FinancesSchema>;

/**
 * Design 5E models fame as a split of public opinion rather than one number, so a
 * scandal can move the haters share without moving the total following.
 */
export const FameSchema = z.object({
  knownFor: z.string().nullable(),
  following: z.number().int().min(0),
  /** Shares out of 100; always sums to 100. */
  fans: z.number().int().min(0).max(100),
  indifferent: z.number().int().min(0).max(100),
  haters: z.number().int().min(0).max(100),
  /** 'portland' → recognised locally; widens with following. */
  reach: z.enum(['none', 'local', 'national', 'global']),
});
export type Fame = z.infer<typeof FameSchema>;

export const ConvictionSchema = z.object({
  id: z.string(),
  offence: z.string(),
  atAge: z.number().int().min(0),
  /** Years served; 0 for a fine or suspended sentence. */
  sentenceYears: z.number().int().min(0),
  fine: MoneySchema,
  /** Design 5D: a record closes named doors. These are checked by event conditions. */
  spent: z.boolean(),
});
export type Conviction = z.infer<typeof ConvictionSchema>;

export const CriminalRecordSchema = z.object({
  convictions: z.array(ConvictionSchema),
  /** Set while serving. Gates almost all other content. */
  incarceration: z
    .object({
      facility: z.string(),
      offence: z.string(),
      totalYears: z.number().int().min(1),
      yearsServed: z.number().int().min(0),
      paroleEligibleIn: z.number().int().min(0),
      behaviour: StatValueSchema,
    })
    .nullable(),
});
export type CriminalRecord = z.infer<typeof CriminalRecordSchema>;

export const HealthConditionSchema = z.object({
  id: z.string(),
  label: z.string(),
  diagnosedAtAge: z.number().int().min(0),
  /** Untreated conditions compound; design 5F reads this history back to the player. */
  treated: z.boolean(),
  annualHealthDrain: z.number().int().min(0),
});
export type HealthCondition = z.infer<typeof HealthConditionSchema>;

export const CharacterSchema = z.object({
  id: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  sex: SexSchema,
  age: z.number().int().min(0).max(140),
  birthYear: z.number().int(),
  countryId: z.string(),
  cityId: z.string(),
  alive: z.boolean(),
  deathAge: z.number().int().nullable(),
  causeOfDeath: z.string().nullable(),
  avatarEmoji: z.string(),
  stats: StatsSchema,
  hidden: HiddenAttributesSchema,
  traitIds: z.array(z.string()),
  finances: FinancesSchema,
  fame: FameSchema,
  /**
   * Never shown until the end, −100..100.
   *
   * BitLife keeps a hidden Karma and reveals it on the gravestone. Ours does
   * that and also reads it while the life is running: it moves the odds
   * wherever another person is deciding something about you — a jury, a parole
   * board, whether somebody forgives being found out — because a moral ledger
   * nobody consults is a scoreboard, not a system.
   */
  karma: z.number().int().min(-100).max(100).default(0),
  record: CriminalRecordSchema,
  conditions: z.array(HealthConditionSchema),
  /** Habits the simulation charges interest on: smoking, drinking, overwork. */
  habitIds: z.array(z.string()),
});
export type Character = z.infer<typeof CharacterSchema>;
