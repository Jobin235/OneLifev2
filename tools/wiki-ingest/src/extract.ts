import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Turns fetched wiki pages into a structural index.
 *
 * The hard rule this file exists to enforce: nothing longer than a short phrase
 * survives. `out/index.json` physically cannot contain a sentence, so there is
 * nothing in it anybody could paste into the game even if they wanted to.
 * See docs/CONTENT_PIPELINE.md.
 */

const RAW = new URL('../out/raw/', import.meta.url).pathname;
const OUT = new URL('../out/', import.meta.url).pathname;

/** A "phrase" is a label. Anything longer is prose, and prose is discarded. */
const MAX_PHRASE_WORDS = 6;
const MAX_PHRASE_CHARS = 48;

/** Verbs that mark a sentence rather than a label. Belt and braces. */
const PROSE_MARKERS =
  /\b(is|are|was|were|will|can|should|you|your|the player|when|if|after|because)\b/i;

export const isPhrase = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PHRASE_CHARS) return false;
  if (trimmed.split(/\s+/).length > MAX_PHRASE_WORDS) return false;
  if (PROSE_MARKERS.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return true;
};

const clean = (text: string): string =>
  text
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2') // wiki links → their label
    .replace(/'''?/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

interface RawSource {
  source: string;
  label: string;
  fetchedAt: string;
  pages: Array<{ category: string; titles: string[] }>;
  listPages: Record<string, string>;
}

export interface ReferenceIndex {
  builtAt: string;
  sources: Array<{
    id: string;
    label: string;
    fetchedAt: string;
    /** Category → the page titles in it. Titles are already labels. */
    categories: Record<string, string[]>;
    /** Phrases pulled out of list-shaped pages: job titles, activities, crimes. */
    phrases: Record<string, string[]>;
    /** Numbers found next to a known keyword, as ranges. */
    numbers: Record<string, { min: number; max: number; samples: number }>;
  }>;
}

const NUMERIC_KEYWORDS = ['salary', 'pay', 'cost', 'price', 'age', 'years', 'chance', 'percent'];

const extractPhrases = (wikitext: string): string[] => {
  const found = new Set<string>();

  for (const line of wikitext.split('\n')) {
    // Bulleted and table-cell entries are where enumerations live.
    const match = /^[*#]\s*(.+)$/.exec(line) ?? /^\|\s*([^|]+)$/.exec(line);
    if (!match?.[1]) continue;
    const candidate = clean(match[1].split('|').pop() ?? '');
    if (isPhrase(candidate)) found.add(candidate);
  }
  return [...found].sort();
};

const extractNumbers = (wikitext: string): Record<string, { min: number; max: number; samples: number }> => {
  const buckets: Record<string, number[]> = {};

  for (const line of wikitext.split('\n')) {
    const lower = line.toLowerCase();
    const keyword = NUMERIC_KEYWORDS.find((k) => lower.includes(k));
    if (!keyword) continue;

    for (const raw of line.match(/\$?[\d,]+(?:\.\d+)?/g) ?? []) {
      const value = Number(raw.replace(/[$,]/g, ''));
      if (!Number.isFinite(value) || value === 0) continue;
      (buckets[keyword] ??= []).push(value);
    }
  }

  return Object.fromEntries(
    Object.entries(buckets).map(([keyword, values]) => [
      keyword,
      { min: Math.min(...values), max: Math.max(...values), samples: values.length },
    ]),
  );
};

const main = async () => {
  await mkdir(OUT, { recursive: true });

  let files: string[] = [];
  try {
    files = (await readdir(RAW)).filter((f) => f.endsWith('.json'));
  } catch {
    console.error('No out/raw/ — run `npm run fetch` first (needs open egress).');
    process.exit(1);
  }

  const index: ReferenceIndex = { builtAt: new Date().toISOString(), sources: [] };

  for (const file of files) {
    const raw = JSON.parse(await readFile(join(RAW, file), 'utf8')) as RawSource;

    const categories = Object.fromEntries(
      raw.pages.map((p) => [p.category, p.titles.filter(isPhrase)]),
    );

    const phrases: Record<string, string[]> = {};
    const numbers: Record<string, { min: number; max: number; samples: number }> = {};

    for (const [title, wikitext] of Object.entries(raw.listPages)) {
      const extracted = extractPhrases(wikitext);
      if (extracted.length > 0) phrases[title] = extracted;
      for (const [keyword, range] of Object.entries(extractNumbers(wikitext))) {
        const existing = numbers[keyword];
        numbers[keyword] = existing
          ? {
              min: Math.min(existing.min, range.min),
              max: Math.max(existing.max, range.max),
              samples: existing.samples + range.samples,
            }
          : range;
      }
    }

    index.sources.push({
      id: raw.source,
      label: raw.label,
      fetchedAt: raw.fetchedAt,
      categories,
      phrases,
      numbers,
    });

    const phraseCount = Object.values(phrases).reduce((n, list) => n + list.length, 0);
    console.log(`${raw.source}: ${Object.keys(categories).length} categories, ${phraseCount} phrases`);
  }

  await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log('→ out/index.json');
};

/** Only run when invoked directly, so importing this module has no side effects. */
const isEntrypoint = process.argv[1]?.endsWith('extract.ts');
if (isEntrypoint) await main();
