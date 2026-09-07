import { z } from 'zod';
import {
  CareerTrackSchema,
  CountryPackSchema,
  EventCategorySchema,
  EventDefinitionSchema,
  TraitDefinitionSchema,
  type CareerTrack,
  type CountryPack,
  type EventDefinition,
  type TraitDefinition,
} from '@lineage/shared-types';

/**
 * Content is data, not TypeScript (spec §100). It is validated as it is assembled
 * and a malformed definition is rejected here rather than at runtime (§186), so a
 * bad content edit fails the build instead of corrupting somebody's life.
 *
 * This module has no filesystem dependency. It takes already-parsed JSON and
 * returns a validated pack, which is what lets the same content power both the
 * server (which reads it from disk) and a browser build (which bundles it).
 */

export const ActivitySchema = z.object({
  id: z.string().min(1),
  icon: z.string().min(1),
  label: z.string().min(1),
  /** Design 2C groups tiles by the kind of thing you are doing. */
  group: z.enum([
    'body_and_head',
    'fun_and_trouble',
    'bigger_moves',
    'relationship',
    'work',
    'school',
    /** Prison has its own menu, because prison is a place you live in for years. */
    'prison',
  ]),
  minAge: z.number().int().min(0).default(0),
  maxAge: z.number().int().default(140),
  /** Cost in cents; 0 is free. */
  cost: z.number().int().min(0).default(0),
  /**
   * Writes no log line of its own.
   *
   * For rows whose whole job is to raise a popup: "Find someone." sitting above
   * "You asked Knox Sandoval out and were turned down." is the same beat told
   * twice, the second time badly. A crime that goes wrong is the opposite case —
   * the line is the story — so this is opt-in rather than inferred.
   */
  silent: z.boolean().default(false),
  /**
   * How many times a year this still does something. 0 means it never fades.
   *
   * There is no global action budget — a year is not a pool of three tokens to
   * spend. What stops a year being farmed is diminishing returns per activity:
   * you can keep tapping, but training stops adding fitness after a few sessions
   * and the fourth doctor's visit tells you what the first one did. That is both
   * how the genre actually behaves and a better fit for content ranging from
   * "call your mother" to "start a company".
   */
  effectiveTimes: z.number().int().min(0).default(3),
  /**
   * What happens past that point. Most things simply stop helping; a few get
   * worse, because over-training injures you and pushing your luck compounds.
   */
  onRepeat: z.enum(['no_effect', 'riskier']).default('no_effect'),
  /**
   * The situation this belongs to. Design 5D gives prison its own things to do
   * with three years; those must not leak into an ordinary Tuesday, where "Lift"
   * would simply be a better "Get in shape".
   */
  onlyWhen: z
    .enum(['anywhere', 'incarcerated', 'enrolled', 'employed', 'unemployed', 'single', 'partnered'])
    .default('anywhere'),
  /** Deterministic effects, using the same effect vocabulary as events. */
  effects: z.array(z.unknown()).default([]),
  /** The "💪 +8 · ❤️ +4" note shown on the tile. */
  note: z.string().default(''),
  /**
   * What happens when it goes wrong.
   *
   * Some things usually work until they don't — cheating, skipping class,
   * gambling, crime. When this is set, the roll happens first: on a backfire the
   * activity's ordinary effects do not apply at all and these do instead, so
   * getting caught is a different outcome rather than a discount on the same one.
   */
  backfire: z
    .object({
      chance: z.number().min(0).max(1),
      /** A stat that makes it less likely, scaled across its 0..100 range. */
      reducedBy: z.string().nullable().default(null),
      /** How much of `chance` the stat can remove at 100. */
      reducedByMost: z.number().min(0).max(1).default(0.6),
      line: z.string().min(1),
      effects: z.array(z.unknown()).default([]),
    })
    .nullable()
    .default(null),
});
export type Activity = z.infer<typeof ActivitySchema>;

/**
 * A decision-free log line: the texture of a year. Cheap to author on purpose,
 * because a life needs hundreds of them. See packages/game/src/chronicle.ts.
 */
export const ChronicleLineSchema = z.object({
  id: z.string().min(1),
  icon: z.string().min(1),
  /** May contain {friend} {partner} {parent} {sibling} {child} {colleague}. */
  text: z.string().min(1),
  category: EventCategorySchema.default('random'),
  minAge: z.number().int().min(0).default(0),
  maxAge: z.number().int().default(140),
  /** Tags that must all be present. See tagsFor() for the vocabulary. */
  requires: z.array(z.string()).default([]),
  /** Tags that must all be absent. */
  forbids: z.array(z.string()).default([]),
  weight: z.number().positive().default(1),
  /** Years before this line may appear again. */
  cooldownYears: z.number().int().min(1).default(12),
});
export type ChronicleLine = z.infer<typeof ChronicleLineSchema>;

/** One branch of an interaction: what happened, and what it did. */
export const InteractionResultSchema = z.object({
  /** May contain {them}. Becomes both a memory and a log line. */
  line: z.string().min(1),
  dimensions: z.record(z.string(), z.number()).default({}),
  stats: z.record(z.string(), z.number()).default({}),
  /** Cents. Negative spends. */
  money: z.number().int().default(0),
  memoryWeight: z.number().int().min(0).max(100).default(20),
});
export type InteractionResult = z.infer<typeof InteractionResultSchema>;

/**
 * Something the player can do to one specific person.
 *
 * Every interaction has two outcomes rather than one fixed delta, chosen by how
 * the relationship already stands. See packages/game/src/interact.ts.
 */
export const InteractionSchema = z.object({
  id: z.string().min(1),
  icon: z.string().min(1),
  label: z.string().min(1),
  /** Relationship kinds this applies to, or ["*"] for anyone. */
  kinds: z.array(z.string()).min(1),
  excludeKinds: z.array(z.string()).default([]),
  minAge: z.number().int().min(0).default(0),
  /** Cents. */
  cost: z.number().int().min(0).default(0),
  /** 0 means unlimited. */
  timesPerYear: z.number().int().min(0).default(3),
  /** Warmth below this and the option is offered but refused. */
  minWarmth: z.number().int().min(0).max(100).default(0),
  /** Odds of the warm branch before warmth is added in. */
  baseWarmChance: z.number().min(0).max(1).default(0.35),
  allowedInPrison: z.boolean().default(false),
  /** Cutting someone off demotes them to an acquaintance. */
  endsRelationship: z.boolean().default(false),
  warm: InteractionResultSchema,
  cool: InteractionResultSchema,
});
export type Interaction = z.infer<typeof InteractionSchema>;

/** Something you can buy. Story assets live in code; these are the shop. */
export const PurchasableSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['house', 'apartment', 'car', 'luxury', 'collectible', 'investment']),
  label: z.string().min(1),
  emoji: z.string().min(1),
  /** Cents. */
  price: z.number().int().min(0),
  /** Cents a year to keep — the part players forget when they buy the yacht. */
  annualCost: z.number().int().min(0),
  minAge: z.number().int().min(0).default(18),
});
export type Purchasable = z.infer<typeof PurchasableSchema>;

export const NpcTemplateFileSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  ageOffset: z.tuple([z.number().int(), z.number().int()]),
  emojiPool: z.array(z.string()).min(1),
  descriptors: z.array(z.string()).min(1),
  occupations: z.array(z.string()).default([]),
  dimensions: z.record(z.string(), z.number()).default({}),
  traitCount: z.number().int().min(0).max(3).default(1),
  detailed: z.boolean().default(false),
});

export interface ContentPack {
  version: number;
  traits: TraitDefinition[];
  traitsById: Map<string, TraitDefinition>;
  countries: CountryPack[];
  countriesById: Map<string, CountryPack>;
  careers: CareerTrack[];
  careersById: Map<string, CareerTrack>;
  events: EventDefinition[];
  eventsById: Map<string, EventDefinition>;
  activities: Activity[];
  chronicle: ChronicleLine[];
  interactions: Interaction[];
  purchasables: Purchasable[];
  npcTemplates: z.infer<typeof NpcTemplateFileSchema>[];
}

export class ContentError extends Error {
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = 'ContentError';
  }
}


/** The raw JSON a pack is assembled from, however it was obtained. */
export interface ContentSources {
  version: unknown;
  traits: unknown;
  countries: unknown[];
  careers: unknown[];
  events: unknown[];
  activities: unknown;
  chronicle: unknown[];
  interactions: unknown;
  purchasables: unknown;
  npcTemplates: unknown;
}

const parseArray = <S extends z.ZodTypeAny>(
  label: string,
  raw: unknown,
  schema: S,
): z.output<S>[] => {
  if (!Array.isArray(raw)) throw new ContentError(label, 'expected a JSON array');
  return raw.map((entry, index) => {
    const result = schema.safeParse(entry);
    if (!result.success) {
      throw new ContentError(label, `entry ${index}: ${result.error.issues[0]?.message ?? 'invalid'}`);
    }
    return result.data;
  });
};

const parseGroups = <S extends z.ZodTypeAny>(
  label: string,
  groups: unknown[],
  schema: S,
): z.output<S>[] => groups.flatMap((group, index) => parseArray(`${label}[${index}]`, group, schema));

/**
 * Validates and indexes a content pack. The cross-file reference check runs here
 * too, so an unreachable follow-up event can never reach a running game.
 */
export const buildContentPack = (sources: ContentSources): ContentPack => {
  const traits = parseArray('traits.json', sources.traits, TraitDefinitionSchema);
  const countries = parseGroups('countries', sources.countries, CountryPackSchema);
  const careers = parseGroups('careers', sources.careers, CareerTrackSchema);
  const events = parseGroups('events', sources.events, EventDefinitionSchema);
  const activities = parseArray('activities.json', sources.activities, ActivitySchema);
  const chronicle = parseGroups('chronicle', sources.chronicle, ChronicleLineSchema);
  const interactions = parseArray('interactions.json', sources.interactions, InteractionSchema);
  const purchasables = parseArray('assets.json', sources.purchasables, PurchasableSchema);
  const npcTemplates = parseArray('npc-templates.json', sources.npcTemplates, NpcTemplateFileSchema);

  const pack: ContentPack = {
    version: Number(sources.version ?? 1),
    traits,
    traitsById: new Map(traits.map((t) => [t.id, t])),
    countries,
    countriesById: new Map(countries.map((c) => [c.id, c])),
    careers,
    careersById: new Map(careers.map((c) => [c.id, c])),
    events,
    eventsById: new Map(events.map((e) => [e.id, e])),
    activities,
    chronicle,
    interactions,
    purchasables,
    npcTemplates,
  };

  validateReferences(pack);
  return pack;
};

/**
 * Cross-file integrity. A scheduled follow-up that names an event which does not
 * exist is the single easiest way to break an event chain, so it is a load error.
 */
export const validateReferences = (pack: ContentPack): void => {
  const problems: string[] = [];

  for (const event of pack.events) {
    for (const choice of event.choices) {
      for (const outcome of choice.outcomes) {
        for (const effect of outcome.effects) {
          if (effect.op === 'schedule' && !pack.eventsById.has(effect.eventId)) {
            problems.push(`${event.id}/${choice.id} schedules unknown event "${effect.eventId}"`);
          }
          if (
            effect.op === 'career_join' &&
            effect.trackId !== 'auto' &&
            !pack.careersById.has(effect.trackId)
          ) {
            problems.push(`${event.id}/${choice.id} joins unknown track "${effect.trackId}"`);
          }
          if (
            effect.op === 'move_city' &&
            effect.cityId !== 'auto' &&
            !pack.countries.some((c) => c.cities.some((city) => city.id === effect.cityId))
          ) {
            problems.push(`${event.id}/${choice.id} moves to unknown city "${effect.cityId}"`);
          }
          if (effect.op === 'trait_add' && !pack.traitsById.has(effect.traitId)) {
            problems.push(`${event.id}/${choice.id} adds unknown trait "${effect.traitId}"`);
          }
        }
      }
    }
    for (const countryId of event.countryIds) {
      if (!pack.countriesById.has(countryId)) {
        problems.push(`${event.id} is scoped to unknown country "${countryId}"`);
      }
    }
  }

  for (const trait of pack.traits) {
    for (const conflict of trait.conflictsWith) {
      if (!pack.traitsById.has(conflict)) {
        problems.push(`trait ${trait.id} conflicts with unknown trait "${conflict}"`);
      }
    }
  }

  const seen = new Set<string>();
  for (const event of pack.events) {
    if (seen.has(event.id)) problems.push(`duplicate event id "${event.id}"`);
    seen.add(event.id);
  }

  const seenLines = new Set<string>();
  for (const line of pack.chronicle) {
    if (seenLines.has(line.id)) problems.push(`duplicate chronicle id "${line.id}"`);
    seenLines.add(line.id);
  }

  if (problems.length > 0) {
    throw new ContentError('content/', `\n  - ${problems.join('\n  - ')}`);
  }
};
