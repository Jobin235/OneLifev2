import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CareerTrackSchema,
  CountryPackSchema,
  EventDefinitionSchema,
  TraitDefinitionSchema,
  type CareerTrack,
  type CountryPack,
  type EventDefinition,
  type TraitDefinition,
} from '@lineage/shared-types';

/**
 * Content is data on disk, not TypeScript (spec §100). Everything is validated on
 * load and a malformed definition is rejected here rather than at runtime (§186),
 * so a bad content edit fails the build instead of corrupting somebody's life.
 */

export const ActivitySchema = z.object({
  id: z.string().min(1),
  icon: z.string().min(1),
  label: z.string().min(1),
  /** Design 2C groups tiles by the kind of thing you are doing. */
  group: z.enum(['body_and_head', 'fun_and_trouble', 'bigger_moves', 'relationship', 'work', 'school']),
  minAge: z.number().int().min(0).default(0),
  maxAge: z.number().int().default(140),
  /** Cost in cents; 0 is free. */
  cost: z.number().int().min(0).default(0),
  /** Whether it consumes one of the year's actions. */
  costsAction: z.boolean().default(true),
  requires: z.unknown().optional(),
  /** Deterministic effects, using the same effect vocabulary as events. */
  effects: z.array(z.unknown()).default([]),
  /** The "💪 +8 · ❤️ +4" note shown on the tile. */
  note: z.string().default(''),
});
export type Activity = z.infer<typeof ActivitySchema>;

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

const here = dirname(fileURLToPath(import.meta.url));

/** Walks up from the package to find the repo's `content/` directory. */
export const defaultContentRoot = (): string => {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'content');
    if (existsSync(join(candidate, 'traits.json'))) return candidate;
    dir = resolve(dir, '..');
  }
  throw new ContentError('content/', 'could not locate the content directory');
};

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ContentError(path, error instanceof Error ? error.message : 'unreadable');
  }
};

const parseAll = <S extends z.ZodTypeAny>(path: string, schema: S): z.output<S>[] => {
  const raw = readJson(path);
  if (!Array.isArray(raw)) throw new ContentError(path, 'expected a JSON array');
  return raw.map((entry, index) => {
    const result = schema.safeParse(entry);
    if (!result.success) {
      throw new ContentError(path, `entry ${index}: ${result.error.issues[0]?.message ?? 'invalid'}`);
    }
    return result.data;
  });
};

const readDirectory = <S extends z.ZodTypeAny>(dir: string, schema: S): z.output<S>[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => parseAll(join(dir, name), schema));
};

export const loadContent = (root: string = defaultContentRoot()): ContentPack => {
  const traits = parseAll(join(root, 'traits.json'), TraitDefinitionSchema);
  const countries = readDirectory(join(root, 'countries'), CountryPackSchema);
  const careers = readDirectory(join(root, 'careers'), CareerTrackSchema);
  const events = readDirectory(join(root, 'events'), EventDefinitionSchema);
  const activities = parseAll(join(root, 'activities.json'), ActivitySchema);
  const npcTemplates = parseAll(join(root, 'npc-templates.json'), NpcTemplateFileSchema);

  const pack: ContentPack = {
    version: Number(readJson(join(root, 'version.json')) ?? 1),
    traits,
    traitsById: new Map(traits.map((t) => [t.id, t])),
    countries,
    countriesById: new Map(countries.map((c) => [c.id, c])),
    careers,
    careersById: new Map(careers.map((c) => [c.id, c])),
    events,
    eventsById: new Map(events.map((e) => [e.id, e])),
    activities,
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

  if (problems.length > 0) {
    throw new ContentError('content/', `\n  - ${problems.join('\n  - ')}`);
  }
};
