import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

export const ComparisonOperatorSchema = z.enum([
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'contains',
  'in',
  'not_in',
  'exists',
  'not_exists',
]);
export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>;

export const ComparisonSchema = z.object({
  /**
   * A dotted path resolved against the condition context, e.g.
   *   age                          stats.health           money.net
   *   career.performance           education.stage        flags.told_emma_about_denver
   *   rel.partner.romance          memory.said_never_relocate
   *   world.economy.fuel           count.children         has.business
   */
  field: z.string().min(1),
  op: ComparisonOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])
    .optional(),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export type Condition =
  | Comparison
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    ComparisonSchema,
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
    z.object({ not: ConditionSchema }),
  ]),
);

/* ------------------------------------------------------------------ *
 * Effects
 *
 * Effects are data. There is deliberately no expression evaluation and no code
 * path from a content file into the runtime (spec §103) — an event can only ask
 * for one of the operations enumerated here.
 * ------------------------------------------------------------------ */

/** 'self', a declared participant role, or a literal npc id. */
export const TargetSchema = z.string().min(1);

export const EffectSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('stat'),
    stat: z.enum(['health', 'happiness', 'smarts', 'fitness', 'charm']),
    delta: z.number().int(),
  }),
  z.object({
    op: z.literal('hidden'),
    attr: z.enum(['discipline', 'creativity', 'luck']),
    delta: z.number().int(),
  }),
  z.object({
    op: z.literal('money'),
    /** Minor units. Negative spends; the engine draws cash first, then savings. */
    delta: z.number().int(),
  }),
  z.object({
    op: z.literal('debt'),
    delta: z.number().int(),
    /** What it is for. Required when borrowing; ignored when repaying. */
    label: z.string().optional(),
    /** Who holds it. */
    holder: z.string().optional(),
    /** Annual interest as a fraction; family lends interest-free. */
    rate: z.number().min(0).max(1).optional(),
  }),
  z.object({ op: z.literal('salary'), delta: z.number().int().optional(), multiplier: z.number().optional() }),
  z.object({
    op: z.literal('relationship'),
    target: TargetSchema,
    dimension: z.enum([
      'affection',
      'trust',
      'respect',
      'conflict',
      'closeness',
      'romance',
      'dependence',
    ]),
    delta: z.number().int(),
  }),
  z.object({
    op: z.literal('remember'),
    target: TargetSchema,
    factKey: z.string().min(1),
    /** The sentence shown on the person's screen (design 2B). */
    line: z.string().min(1),
    weight: z.number().int().min(0).max(100).default(50),
    data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  }),
  z.object({ op: z.literal('resolve_memory'), target: TargetSchema, factKey: z.string() }),
  z.object({ op: z.literal('relationship_kind'), target: TargetSchema, kind: z.string() }),
  z.object({ op: z.literal('trait_add'), traitId: z.string() }),
  z.object({ op: z.literal('trait_remove'), traitId: z.string() }),
  z.object({ op: z.literal('habit_add'), habitId: z.string() }),
  z.object({ op: z.literal('habit_remove'), habitId: z.string() }),
  z.object({
    op: z.literal('condition_add'),
    conditionId: z.string(),
    label: z.string(),
    annualHealthDrain: z.number().int().min(0).default(1),
  }),
  z.object({ op: z.literal('condition_treat'), conditionId: z.string() }),
  z.object({ op: z.literal('flag'), key: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean()]) }),
  /**
   * Answers the interview question on the application currently in flight.
   * `fit` is how well the answer lands with this employer, and it moves the
   * hire chance — which is what turns "a job appeared" into "you got the job".
   */
  z.object({ op: z.literal('interview_answer'), fit: z.number().int().min(-2).max(2) }),
  /**
   * Takes the treatment on the symptom popup currently on screen. `option` is
   * the index of the row the player picked, which is what decides the fee and
   * the odds — the details live in flags because they belong to this particular
   * illness and this particular pair of doctors, not to the definition.
   */
  z.object({ op: z.literal('treatment'), option: z.number().int().min(0).max(3) }),
  /** Answers the love-interest card currently on screen. */
  z.object({ op: z.literal('court'), askedOut: z.boolean() }),
  /** Goes looking. Raises a love-interest card rather than changing anything. */
  z.object({ op: z.literal('meet_someone') }),
  /**
   * Charges the character rather than convicting them: raises the lawyer list,
   * which raises the plea, which decides the sentence. `convict` still exists
   * for the events that hand down a sentence with no argument.
   */
  z.object({
    op: z.literal('charge'),
    offence: z.string().min(1),
    /** 0 for the offences that carry a fine and a record but no cell. */
    sentenceYears: z.number().int().min(0),
    fine: z.number().int().min(0).default(0),
    facility: z.string().default('the county jail'),
  }),
  /**
   * A year spent posting. The size of the account, the streak and how the
   * character comes across decide what it does; the op carries nothing because
   * none of that belongs to the activity row that raised it.
   */
  z.object({ op: z.literal('post_online') }),
  /** Answers the audition currently on screen: play it safe, or go for it. */
  z.object({ op: z.literal('audition_effort'), effort: z.enum(['safe', 'bold']) }),
  /** Picks one of the three firms on the charge sheet. */
  z.object({ op: z.literal('hire_lawyer'), tier: z.number().int().min(0).max(2) }),
  /** Picks a tenant off the applicant list, or pays to check them first. */
  z.object({ op: z.literal('let_property'), pick: z.enum(['a', 'b', 'c', 'check', 'none']) }),
  /** Answers the charge. */
  z.object({ op: z.literal('enter_plea'), how: z.enum(['guilty', 'not_guilty', 'no_contest']) }),
  /** How you are getting on inside. Parole reads it; so do the guards. */
  z.object({ op: z.literal('behaviour'), delta: z.number().int() }),
  /**
   * Out early, or out now. `parole` only works once the sentence says you are
   * eligible; `escape` is the minigame's success branch and adds to the sentence
   * when it is not.
   */
  z.object({ op: z.literal('release'), how: z.enum(['parole', 'appeal', 'escape']) }),
  /** Adds years for something done inside. */
  z.object({ op: z.literal('extend_sentence'), years: z.number().int().min(1) }),
  z.object({ op: z.literal('fame'), following: z.number().int().default(0), fans: z.number().int().default(0), haters: z.number().int().default(0), knownFor: z.string().optional() }),
  z.object({ op: z.literal('reputation'), delta: z.number().int() }),
  /** Moves grade points (0..400, four points to a GPA decimal). No-op out of school. */
  z.object({ op: z.literal('grades'), delta: z.number().int() }),
  /** Standing among the other students. No-op out of school. */
  z.object({ op: z.literal('popularity'), delta: z.number().int() }),
  /** Joins a club if there is a free slot. */
  z.object({ op: z.literal('join_club'), clubId: z.string().optional() }),
  /** Leaves school for good, keeping whatever was completed before now. */
  z.object({ op: z.literal('drop_out') }),
  /** Moves job performance (0..100). No-op when unemployed. */
  z.object({ op: z.literal('performance'), delta: z.number().int() }),
  /** Raises salary by a percentage. No-op when unemployed. */
  z.object({ op: z.literal('raise'), percent: z.number() }),
  /** Leaves the job, on your own terms. */
  z.object({ op: z.literal('quit_job') }),
  z.object({
    op: z.literal('convict'),
    offence: z.string(),
    sentenceYears: z.number().int().min(0),
    fine: z.number().int().min(0).default(0),
    facility: z.string().default('the county jail'),
  }),
  z.object({ op: z.literal('career_promote') }),
  z.object({ op: z.literal('career_leave'), reason: z.enum(['quit', 'fired', 'laid_off', 'retired']) }),
  z.object({ op: z.literal('career_join'), trackId: z.string(), rungIndex: z.number().int().min(0).default(0) }),
  z.object({ op: z.literal('career_performance'), delta: z.number().int() }),
  z.object({ op: z.literal('career_close_track'), trackId: z.string() }),
  z.object({ op: z.literal('asset_add'), assetId: z.string() }),
  z.object({ op: z.literal('asset_sell'), assetRef: z.string() }),
  z.object({ op: z.literal('business_start'), templateId: z.string() }),
  z.object({ op: z.literal('business_units'), delta: z.number().int() }),
  z.object({ op: z.literal('business_price'), pct: z.number() }),
  z.object({ op: z.literal('business_close') }),
  z.object({ op: z.literal('spawn_npc'), role: z.string(), templateId: z.string() }),
  z.object({ op: z.literal('child_born'), namedAfter: z.string().optional() }),
  z.object({ op: z.literal('move_city'), cityId: z.string() }),
  z.object({
    op: z.literal('schedule'),
    eventId: z.string(),
    /** Life years from now. 0 means "as early as next age-up". */
    inYears: z.number().int().min(0),
    priority: z.number().int().min(0).max(100).optional(),
    /** Roles carried forward so the follow-up lands on the same people. */
    carryParticipants: z.boolean().default(true),
  }),
]);
export type Effect = z.infer<typeof EffectSchema>;

/* ------------------------------------------------------------------ *
 * Definitions
 * ------------------------------------------------------------------ */

export const EventCategorySchema = z.enum([
  'childhood',
  'education',
  'career',
  'relationship',
  'family',
  'money',
  'business',
  'crime',
  'prison',
  'politics',
  'health',
  'fame',
  'world',
  'random',
]);
export type EventCategory = z.infer<typeof EventCategorySchema>;

/**
 * The coloured strip at the top of the card (design 1A/1C). `label` is the
 * all-caps word — "WORK", "EMMA", "YOUR BUSINESS" — and may interpolate a
 * participant's name.
 */
export const CardStyleSchema = z.object({
  icon: z.string().min(1),
  label: z.string().min(1),
  tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export type CardStyle = z.infer<typeof CardStyleSchema>;

/** How the engine finds the NPC a role refers to. */
export const ParticipantSelectorSchema = z.object({
  role: z.string().min(1),
  /** Any of these relationship kinds qualifies. */
  kinds: z.array(z.string()).default([]),
  /** Optional extra filter on the candidate relationship. */
  where: ConditionSchema.optional(),
  /** Ranking rule when several people qualify. */
  pick: z.enum(['closest', 'most_conflict', 'oldest', 'youngest', 'random']).default('closest'),
  /** If false, the event can still fire with the role unbound. */
  required: z.boolean().default(true),
});
export type ParticipantSelector = z.infer<typeof ParticipantSelectorSchema>;

export const ChoiceSchema = z.object({
  id: z.string().min(1),
  /** Button text: "Take it and move". */
  label: z.string().min(1),
  /** Optional right-hand annotation: "$2,400", "risky", "caught 34%". */
  note: z.string().optional(),
  /**
   * A price on the button, and a bar for what it buys.
   *
   * This is the shape BitLife uses wherever money changes the odds — three law
   * firms at $1,270 / $13,970 / free, two doctors with reputation bars — and it
   * makes "pay more for better odds" legible without any arithmetic. The bar is
   * 0..100 and is drawn, not stated.
   */
  price: z.string().optional(),
  quality: z.number().int().min(0).max(100).optional(),
  /** Hidden gate — an unaffordable or ineligible choice is not offered. */
  requires: ConditionSchema.optional(),
  /**
   * When set, the button raises a Confirm sheet carrying this sentence before
   * anything happens. Reserved for choices a player would regret misfiring —
   * insulting a cellmate, quitting a job, turning down an inheritance.
   */
  confirm: z.string().optional(),
  /**
   * Branching outcomes, evaluated in order; the first whose `chance` roll and
   * `when` condition both pass is applied. The last entry should be unconditional.
   */
  outcomes: z
    .array(
      z.object({
        id: z.string().min(1),
        when: ConditionSchema.optional(),
        /** 0..1. Omitted means certain. Rolled from the deterministic seed. */
        chance: z.number().min(0).max(1).optional(),
        /**
         * The headline on the result toast — "BFFL", "Denied", "A slave to my
         * craft". Two or three words, written, and the place the game's voice
         * lives. Omitted outcomes fall back to the event's own title.
         */
        title: z.string().optional(),
        /** Past-tense sentence shown on the result card. */
        text: z.string().min(1),
        /** One line for "Earlier this year" and the life history. */
        historyLine: z.string().min(1),
        effects: z.array(EffectSchema).default([]),
      }),
    )
    .min(1),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const EventDefinitionSchema = z.object({
  id: z.string().min(1),
  /** Bumped whenever meaning changes, so old instances stay interpretable (§65). */
  version: z.number().int().min(1).default(1),
  category: EventCategorySchema,
  card: CardStyleSchema,
  /** Major events get the card; minor ones are recap lines only. */
  weightClass: z.enum(['major', 'minor']).default('major'),
  /** Base ranking weight before relevance and randomness (§19). */
  priority: z.number().int().min(0).max(100).default(50),
  minAge: z.number().int().min(0).default(0),
  maxAge: z.number().int().max(140).default(140),
  conditions: ConditionSchema.optional(),
  participants: z.array(ParticipantSelectorSchema).default([]),
  /** "{partner} asked what you think about kids." */
  title: z.string().min(1),
  body: z.string().min(1),
  /**
   * The line immediately above the buttons — "What will you do?", "How will you
   * plead?", "What will you say?". Separated from the body because it is asked
   * in a different voice from the description and always sits last.
   */
  question: z.string().default('What will you do?'),
  /**
   * A single named quantity shown between the body and the buttons: "Possible
   * Sentence: 2 years", "Consultation Fee: $100". It states the stake so the
   * player is not doing arithmetic in their head.
   */
  stake: z.object({ label: z.string(), value: z.string() }).nullable().default(null),
  /**
   * Dropdowns inside the popup, above the buttons: "Pick your major", "Pick
   * your move" / "Pick your target", "Pick your objective".
   *
   * They are how BitLife gets combinatorial choices without more screens — one
   * Attack popup covers seven moves and four targets — and they are the reason
   * choosing a major is the player's decision rather than a die roll. The chosen
   * values land in `flags.select_<id>` before effects run, so a handler reads
   * them the same way it reads anything else about the character.
   */
  selects: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        /** A fixed list, written in content. */
        options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
        /** Or a named catalogue the engine supplies: "majors", "trades". */
        optionsFrom: z.string().optional(),
      }),
    )
    .default([]),
  choices: z.array(ChoiceSchema).min(1),
  /** Life years before this definition may fire again for the same character. */
  cooldownYears: z.number().int().min(0).default(5),
  /** Hard cap per life. 1 = a once-in-a-lifetime beat. */
  maxPerLife: z.number().int().min(1).default(1),
  /** Only reachable when explicitly scheduled by another event. */
  scheduledOnly: z.boolean().default(false),
  /** Countries this content is valid in; empty means everywhere. */
  countryIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
export type EventDefinition = z.infer<typeof EventDefinitionSchema>;

/* ------------------------------------------------------------------ *
 * Instances
 * ------------------------------------------------------------------ */

export const EventInstanceSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  definitionVersion: z.number().int().min(1),
  atAge: z.number().int().min(0),
  card: CardStyleSchema.extend({
    /**
     * Resolved at instantiation from the event's participants. When an event is
     * about somebody, the popup's header band names them and says who they are
     * to you, every time — the player is not expected to remember forty names.
     */
    who: z
      .object({ name: z.string(), emoji: z.string(), relation: z.string() })
      .nullable()
      .default(null),
  }),
  title: z.string(),
  body: z.string(),
  question: z.string().default('What will you do?'),
  stake: z.object({ label: z.string(), value: z.string() }).nullable().default(null),
  /**
   * A fact sheet above the buttons: Name / Gender / Age / Occupation / House.
   * How BitLife introduces a stranger you are being asked to judge.
   */
  facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  /**
   * Bars beside it — Looks, Smarts, Money, Craziness. Drawn rather than
   * numbered, because the player is meant to glance and decide.
   */
  meters: z
    .array(z.object({ label: z.string(), value: z.number().int().min(0).max(100) }))
    .default([]),
  /** Resolved dropdowns: the options are real by the time the client sees them. */
  selects: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
      }),
    )
    .default([]),
  choices: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      note: z.string().optional(),
      price: z.string().optional(),
      quality: z.number().int().min(0).max(100).optional(),
      confirm: z.string().optional(),
      disabled: z.boolean().optional(),
    }),
  ),
  /** role → npcId */
  participants: z.record(z.string(), z.string()).default({}),
  /** Set once resolved. An instance can only be resolved once (§124). */
  chosenChoiceId: z.string().nullable(),
  /** The written headline on the result toast: "BFFL", "Denied", "Stale mate". */
  outcomeTitle: z.string().nullable().default(null),
  outcomeText: z.string().nullable(),
  historyLine: z.string().nullable(),
  deltas: z
    .array(z.object({ text: z.string(), positive: z.boolean() }))
    .default([]),
});
export type EventInstance = z.infer<typeof EventInstanceSchema>;

export const ScheduledEventSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  dueAtAge: z.number().int().min(0),
  priorityOverride: z.number().int().min(0).max(100).nullable(),
  participants: z.record(z.string(), z.string()).default({}),
});
export type ScheduledEvent = z.infer<typeof ScheduledEventSchema>;
