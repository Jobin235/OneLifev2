import { z } from 'zod';
import { MoneySchema, StatValueSchema } from './primitives.js';

/** One rung of the visible ladder on design 3B. */
export const LadderRungSchema = z.object({
  id: z.string(),
  title: z.string(),
  salary: MoneySchema,
  /** Minimum years of total experience before this rung is reachable. */
  minExperience: z.number().int().min(0),
  minPerformance: StatValueSchema,
});
export type LadderRung = z.infer<typeof LadderRungSchema>;

export const CareerTrackSchema = z.object({
  id: z.string(),
  label: z.string(),
  industry: z.string(),
  /** Content gate: which countries offer this ladder at all. */
  countryIds: z.array(z.string()).default([]),
  requiredEducation: z.enum(['none', 'secondary', 'vocational', 'university', 'graduate']),
  requiredStats: z.record(z.string(), z.number()).default({}),
  rungs: z.array(LadderRungSchema).min(1),
  /** Short high-variance ladders (sport, design 5B) retire early and hard. */
  retiresAtAge: z.number().int().nullable().default(null),
  /** Where a retired athlete or executive can go next. */
  exitTrackIds: z.array(z.string()).default([]),
  /**
   * A ladder the public can see you on.
   *
   * How many people know your name each year you stay on it, roughly. Zero for
   * the ordinary jobs, which is nearly all of them: an accountant is not
   * famous, and fame that arrives from a career nobody watches is the reason
   * BitLife ties it to a specific short list of professions.
   */
  fameGain: z.number().int().min(0).default(0),
  /** What the public would say you are, if they said anything. */
  knownFor: z.string().nullable().default(null),
  /**
   * Auditions rather than applications: you cannot apply to be an actor, you go
   * up for parts and are mostly turned down.
   */
  auditions: z.boolean().default(false),
});
export type CareerTrack = z.infer<typeof CareerTrackSchema>;

export const PerformanceBandSchema = z.enum(['struggling', 'fine', 'strong', 'outstanding']);
export type PerformanceBand = z.infer<typeof PerformanceBandSchema>;

export const EmploymentSchema = z.object({
  trackId: z.string(),
  employerName: z.string(),
  rungId: z.string(),
  title: z.string(),
  salary: MoneySchema,
  yearsInRole: z.number().int().min(0),
  yearsAtEmployer: z.number().int().min(0),
  performance: StatValueSchema,
  satisfaction: StatValueSchema,
  /** Design 3B: exactly one named rival on the ladder, not an org chart. */
  rivalNpcId: z.string().nullable(),
  managerNpcId: z.string().nullable(),
});
export type Employment = z.infer<typeof EmploymentSchema>;

export const CareerStateSchema = z.object({
  current: EmploymentSchema.nullable(),
  /** Total years worked anywhere; drives ladder eligibility. */
  totalExperience: z.number().int().min(0),
  retired: z.boolean(),
  history: z.array(
    z.object({
      trackId: z.string(),
      employerName: z.string(),
      title: z.string(),
      fromAge: z.number().int(),
      toAge: z.number().int().nullable(),
      endedBy: z.enum(['promoted', 'quit', 'fired', 'laid_off', 'retired', 'imprisoned', 'died']),
    }),
  ),
  /** Tracks permanently closed by a conviction (design 5D). */
  closedTrackIds: z.array(z.string()).default([]),
});
export type CareerState = z.infer<typeof CareerStateSchema>;
