import { z } from 'zod';
import { MoneySchema } from './primitives.js';

export const EducationStageSchema = z.enum([
  'none',
  'primary',
  'secondary',
  'vocational',
  'university',
  'graduate',
]);
export type EducationStage = z.infer<typeof EducationStageSchema>;

export const EnrolmentSchema = z.object({
  stage: EducationStageSchema,
  institutionName: z.string(),
  /** Null below university. */
  major: z.string().nullable(),
  yearIndex: z.number().int().min(1),
  totalYears: z.number().int().min(1),
  /** 0..400 → GPA 0.0–4.0, kept integral. Design 3A shows "B+ average", 5A "GPA 3.4". */
  gradePoints: z.number().int().min(0).max(400),
  subjects: z.array(z.object({ name: z.string(), gradePoints: z.number().int().min(0).max(400) })),
  clubIds: z.array(z.string()).default([]),
  clubSlots: z.number().int().min(0).default(3),
  /** Design 5A pins this in the header, in red, for a decade. */
  debtIncurred: MoneySchema,
  onScholarship: z.boolean().default(false),
});
export type Enrolment = z.infer<typeof EnrolmentSchema>;

export const EducationStateSchema = z.object({
  highestCompleted: EducationStageSchema,
  current: EnrolmentSchema.nullable(),
  history: z.array(
    z.object({
      stage: EducationStageSchema,
      institutionName: z.string(),
      major: z.string().nullable(),
      fromAge: z.number().int(),
      toAge: z.number().int(),
      completed: z.boolean(),
      finalGradePoints: z.number().int().min(0).max(400),
    }),
  ),
});
export type EducationState = z.infer<typeof EducationStateSchema>;
