import { z } from 'zod';

/**
 * What the API hands the client (§76). It is presentation-ready: the client does
 * no simulation, no derivation and no rule evaluation — it renders these fields.
 */
export const StatBarSchema = z.object({
  key: z.string(),
  icon: z.string(),
  label: z.string(),
  value: z.number().int(),
  color: z.string(),
});

export const PersonRowSchema = z.object({
  npcId: z.string(),
  name: z.string(),
  emoji: z.string(),
  /** "Girlfriend · 3 years", "Best friend · owes you $2,500" */
  subtitle: z.string(),
  band: z.enum(['close', 'around', 'drifted']),
  /** Headline number and its icon, per design 2A. */
  scoreIcon: z.string(),
  score: z.number().int(),
  scoreColor: z.string(),
});

export const ActionCardSchema = z.object({
  id: z.string(),
  icon: z.string(),
  label: z.string(),
  /** "💪 +8 · ❤️ +4", "$180", "who knows", "caught 34%" */
  note: z.string(),
  group: z.enum(['body_and_head', 'fun_and_trouble', 'bigger_moves', 'relationship', 'work', 'school']),
  tint: z.string(),
  noteColor: z.string(),
  available: z.boolean(),
  /** Times left this year; null when the activity has no annual limit. */
  timesLeft: z.number().int().nullable(),
  /** Why it is greyed out, if it is. */
  blockedReason: z.string().nullable(),
});

export const LifeViewSchema = z.object({
  lifeId: z.string(),
  revision: z.number().int(),
  dateLine: z.string(),
  name: z.string(),
  age: z.number().int(),
  avatarEmoji: z.string(),
  /** "Age 34 · Portland · Owner, Rivera Hauling" */
  subtitle: z.string(),
  stats: z.array(StatBarSchema),
  jobLine: z.string(),
  money: z.string(),
  gameState: z.string(),
  activeEvent: z.unknown().nullable(),
  resolvedEvent: z.unknown().nullable(),
  birthdayLine: z.string().nullable(),
  /** The whole life so far, oldest first. */
  log: z.array(
    z.object({
      atAge: z.number().int(),
      icon: z.string(),
      text: z.string(),
      /** Milestones are set apart in the log rather than reading as one more line. */
      major: z.boolean(),
    }),
  ),
  quickActions: z.array(ActionCardSchema),
  canAgeUp: z.boolean(),
  ageUpLabel: z.string(),
});
export type LifeView = z.infer<typeof LifeViewSchema>;
