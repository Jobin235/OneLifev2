import { z } from 'zod';

/**
 * Every number the designers will want to move lives here (spec §135). Nothing in
 * the simulation is allowed to hardcode a tuning value; if you find yourself
 * typing a magic number into a rule, it belongs in this file.
 */

export const LifeStageBoundsSchema = z.object({
  early_childhood: z.tuple([z.number(), z.number()]),
  childhood: z.tuple([z.number(), z.number()]),
  teenage: z.tuple([z.number(), z.number()]),
  young_adult: z.tuple([z.number(), z.number()]),
  adult: z.tuple([z.number(), z.number()]),
  middle_age: z.tuple([z.number(), z.number()]),
  senior: z.tuple([z.number(), z.number()]),
  elder: z.tuple([z.number(), z.number()]),
});

export const GameConfigSchema = z.object({
  lifeStages: LifeStageBoundsSchema,

  aging: z.object({
    /** Health drifts down from this age, faster each decade. */
    healthDeclineFromAge: z.number().int(),
    healthDeclinePerYear: z.number(),
    healthDeclineAcceleration: z.number(),
    /** Fitness always decays; the player has to spend actions to hold it. */
    fitnessDecayPerYear: z.number(),
    /** Smarts decay very late, and slowly. */
    smartsDeclineFromAge: z.number().int(),
    smartsDeclinePerYear: z.number(),
    /** Charm peaks then eases off. */
    charmPeakAge: z.number().int(),
    charmDeclinePerYear: z.number(),
  }),

  mortality: z.object({
    /** Gompertz-ish: annual death chance = base * exp(rate * (age - offset)). */
    base: z.number(),
    rate: z.number(),
    offset: z.number(),
    /** Health below this adds a flat extra annual risk, scaled by how far below. */
    frailHealthThreshold: z.number().int(),
    frailRiskPerPoint: z.number(),
    /** Nobody survives past here. */
    hardCapAge: z.number().int(),
  }),

  events: z.object({
    /** Spec §19: 0–1 major and 0–2 minor per age-up. */
    maxMajorPerYear: z.number().int(),
    maxMinorPerYear: z.number().int(),
    /** Candidates are scored; this many are kept before the final roll. */
    shortlistSize: z.number().int(),
    /** Multiplier applied when the same category fired recently (§108). */
    categoryRepeatPenalty: z.number(),
    categoryRepeatWindowYears: z.number().int(),
    /** Chance a quiet year is left deliberately empty. */
    quietYearChance: z.number(),
  }),

  world: z.object({
    /** Fractional change thresholds for return-diff significance (§90). */
    significance: z.object({
      minor: z.number(),
      meaningful: z.number(),
      major: z.number(),
    }),
    /** Hidden cooldown between return events, in hours (§9). */
    returnEventCooldownHours: z.number(),
    /** Even when everything qualifies, most logins must stay ordinary. */
    returnEventChance: z.number(),
    tickHours: z.number(),
    /** Per-tick random walk applied to every indicator. */
    driftPerTick: z.number(),
    /** Indicators are pulled back toward 100 at this rate. */
    meanReversion: z.number(),
  }),

  money: z.object({
    /** Baseline annual cost of living before city multipliers, in cents. */
    baseAnnualExpenses: z.number().int(),
    /** Added per dependent child. */
    perChildAnnualCost: z.number().int(),
    savingsInterest: z.number(),
    debtInterest: z.number(),
    /** Flat effective rate; the game is not a tax simulator (§137). */
    taxRate: z.number(),
  }),

  relationships: z.object({
    /** Bands on the surfaced score (design 2A). */
    closeThreshold: z.number().int(),
    driftedThreshold: z.number().int(),
    /** Decay per year without contact. */
    decayPerYear: z.number(),
    /** Family decays more slowly. */
    familyDecayMultiplier: z.number(),
    /** Memories below this weight stop being shown on the person screen. */
    memoryDisplayThreshold: z.number().int(),
    maxDisplayedMemories: z.number().int(),
  }),

  career: z.object({
    /** Performance drifts toward this blend of discipline and smarts. */
    performanceInertia: z.number(),
    promotionMinYearsInRole: z.number().int(),
    /** Annual raise for staying put, as a fraction. */
    stayingRaise: z.number(),
  }),

  legacy: z.object({
    /** History entries at or above this significance become chapter material. */
    chapterSignificanceThreshold: z.number().int(),
    chapterCount: z.number().int(),
  }),
});
export type GameConfig = z.infer<typeof GameConfigSchema>;

export const DEFAULT_CONFIG: GameConfig = GameConfigSchema.parse({
  lifeStages: {
    early_childhood: [0, 4],
    childhood: [5, 12],
    teenage: [13, 17],
    young_adult: [18, 24],
    adult: [25, 39],
    middle_age: [40, 59],
    senior: [60, 74],
    elder: [75, 140],
  },
  aging: {
    healthDeclineFromAge: 32,
    healthDeclinePerYear: 0.34,
    healthDeclineAcceleration: 0.012,
    fitnessDecayPerYear: 1.1,
    smartsDeclineFromAge: 65,
    smartsDeclinePerYear: 0.4,
    charmPeakAge: 27,
    charmDeclinePerYear: 0.45,
  },
  mortality: {
    base: 0.0002,
    rate: 0.086,
    offset: 20,
    frailHealthThreshold: 35,
    frailRiskPerPoint: 0.0009,
    hardCapAge: 122,
  },
  events: {
    maxMajorPerYear: 1,
    maxMinorPerYear: 2,
    shortlistSize: 12,
    categoryRepeatPenalty: 0.45,
    categoryRepeatWindowYears: 3,
    quietYearChance: 0.12,
  },
  world: {
    significance: { minor: 0.05, meaningful: 0.1, major: 0.2 },
    returnEventCooldownHours: 36,
    returnEventChance: 0.25,
    tickHours: 1,
    driftPerTick: 0.35,
    meanReversion: 0.01,
  },
  money: {
    baseAnnualExpenses: 1_900_000,
    perChildAnnualCost: 900_000,
    savingsInterest: 0.03,
    debtInterest: 0.07,
    taxRate: 0.24,
  },
  relationships: {
    closeThreshold: 70,
    driftedThreshold: 25,
    decayPerYear: 3,
    familyDecayMultiplier: 0.4,
    memoryDisplayThreshold: 25,
    maxDisplayedMemories: 6,
  },
  career: {
    performanceInertia: 0.75,
    promotionMinYearsInRole: 2,
    stayingRaise: 0.03,
  },
  legacy: {
    chapterSignificanceThreshold: 55,
    chapterCount: 5,
  },
});

export const lifeStageFor = (age: number, config: GameConfig = DEFAULT_CONFIG): string => {
  for (const [stage, [lo, hi]] of Object.entries(config.lifeStages)) {
    if (age >= lo && age <= hi) return stage;
  }
  return 'elder';
};
