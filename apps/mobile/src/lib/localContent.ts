import { buildContentPack, type ContentPack } from '@lineage/content';

/**
 * The same content the server reads from disk, bundled into the client instead.
 *
 * This exists so the game can be played with no backend — a build you can open
 * from a link. It is not how the shipped product works: the real client is a
 * presentation layer talking to an authoritative server, and this bundle is a
 * demo of the simulation rather than a replacement for it.
 */
const one = <T>(modules: Record<string, { default: T }>, path: string): T => {
  const found = Object.entries(modules).find(([key]) => key.endsWith(path));
  if (!found) throw new Error(`bundled content is missing ${path}`);
  return found[1].default;
};

const all = <T>(modules: Record<string, { default: T }>): T[] =>
  Object.keys(modules)
    .sort()
    .map((key) => modules[key]!.default);

const root = import.meta.glob<{ default: unknown }>('../../../../content/*.json', { eager: true });
const countries = import.meta.glob<{ default: unknown }>('../../../../content/countries/*.json', { eager: true });
const careers = import.meta.glob<{ default: unknown }>('../../../../content/careers/*.json', { eager: true });
const events = import.meta.glob<{ default: unknown }>('../../../../content/events/*.json', { eager: true });
const chronicle = import.meta.glob<{ default: unknown }>('../../../../content/chronicle/*.json', { eager: true });

export const localContent = (): ContentPack =>
  buildContentPack({
    version: one(root, 'version.json'),
    traits: one(root, 'traits.json'),
    activities: one(root, 'activities.json'),
    npcTemplates: one(root, 'npc-templates.json'),
    countries: all(countries),
    careers: all(careers),
    events: all(events),
    chronicle: all(chronicle),
    interactions: one(root, 'interactions.json'),
    purchasables: one(root, 'assets.json'),
    ambitions: one(root, 'ambitions.json'),
  });
