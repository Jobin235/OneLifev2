import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentError, buildContentPack, type ContentPack } from './pack.js';

/**
 * Reads the content directory from disk. This is the server's way in; the client
 * bundles the same JSON and calls `buildContentPack` directly.
 */

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

const readDirectory = (dir: string): unknown[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson(join(dir, name)));
};

export const loadContent = (root: string = defaultContentRoot()): ContentPack =>
  buildContentPack({
    version: readJson(join(root, 'version.json')),
    traits: readJson(join(root, 'traits.json')),
    countries: readDirectory(join(root, 'countries')),
    careers: readDirectory(join(root, 'careers')),
    events: readDirectory(join(root, 'events')),
    activities: readJson(join(root, 'activities.json')),
    npcTemplates: readJson(join(root, 'npc-templates.json')),
  });
