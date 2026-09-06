import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES, type WikiSource } from './sources.ts';

/**
 * Fetches page structure through the MediaWiki API.
 *
 * We are a guest on someone else's server, so: a real user-agent that says who we
 * are, one request at a time, a delay between them, and `maxlag` so we back off
 * automatically when the wiki is under load.
 */

const OUT = new URL('../out/raw/', import.meta.url).pathname;
const USER_AGENT =
  'OneLifeContentResearch/0.1 (structural reference only; contact: dev@onelife.game)';
const DELAY_MS = 1200;
const MAX_PAGES_PER_CATEGORY = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Fetcher {
  private lastCall = 0;

  async call(api: string, params: Record<string, string>): Promise<unknown> {
    const wait = DELAY_MS - (Date.now() - this.lastCall);
    if (wait > 0) await sleep(wait);
    this.lastCall = Date.now();

    const url = new URL(api);
    for (const [key, value] of Object.entries({
      ...params,
      format: 'json',
      formatversion: '2',
      maxlag: '5',
    })) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });

    if (response.status === 429 || response.status === 503) {
      // Back off and try once more. If it fails again, that is an answer.
      await sleep(10_000);
      const retry = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      if (!retry.ok) throw new Error(`${retry.status} after backoff: ${url}`);
      return retry.json();
    }
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);

    const body = (await response.json()) as { error?: { code: string; info: string } };
    if (body.error) throw new Error(`MediaWiki error ${body.error.code}: ${body.error.info}`);
    return body;
  }
}

/** Refuse to run against a host whose robots.txt disallows us. */
const robotsAllows = async (api: string): Promise<boolean> => {
  try {
    const robots = new URL('/robots.txt', api);
    const response = await fetch(robots, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) return true;
    const text = await response.text();

    // Only the wildcard group concerns us; we are not pretending to be a browser.
    const wildcard = text.split(/User-agent:/i).find((block) => block.trimStart().startsWith('*'));
    if (!wildcard) return true;
    return !wildcard
      .split('\n')
      .some((line) => /^\s*Disallow:\s*\/\s*$/i.test(line));
  } catch {
    return true;
  }
};

const fetchSource = async (fetcher: Fetcher, source: WikiSource) => {
  if (!(await robotsAllows(source.api))) {
    console.warn(`SKIP ${source.id}: robots.txt disallows automated access`);
    return null;
  }

  const pages: Array<{ category: string; titles: string[] }> = [];

  for (const category of source.categories) {
    try {
      const body = (await fetcher.call(source.api, {
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${category}`,
        cmlimit: String(MAX_PAGES_PER_CATEGORY),
      })) as { query?: { categorymembers?: Array<{ title: string }> } };

      const titles = (body.query?.categorymembers ?? []).map((m) => m.title);
      pages.push({ category, titles });
      console.log(`  ${source.id}/${category}: ${titles.length} pages`);
    } catch (error) {
      console.warn(`  ${source.id}/${category}: ${(error as Error).message}`);
      pages.push({ category, titles: [] });
    }
  }

  // One extra pass for the list-shaped pages, which is where the enumerations of
  // job titles and activities actually live.
  const listPages: Record<string, string> = {};
  const listTitles = pages
    .flatMap((p) => p.titles)
    .filter((title) => /list of|careers|jobs|activities|crimes/i.test(title))
    .slice(0, 40);

  for (const title of listTitles) {
    try {
      const body = (await fetcher.call(source.api, {
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: title,
      })) as {
        query?: { pages?: Array<{ revisions?: Array<{ slots?: { main?: { content?: string } } }> }> };
      };
      const content = body.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
      if (content) listPages[title] = content;
    } catch (error) {
      console.warn(`  ${source.id}/${title}: ${(error as Error).message}`);
    }
  }

  return { source: source.id, label: source.label, fetchedAt: new Date().toISOString(), pages, listPages };
};

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const fetcher = new Fetcher();

  for (const source of SOURCES) {
    console.log(`Fetching ${source.label}…`);
    const result = await fetchSource(fetcher, source);
    if (!result) continue;
    await writeFile(join(OUT, `${source.id}.json`), JSON.stringify(result, null, 2));
    console.log(`  → out/raw/${source.id}.json`);
  }
};

/** Only run when invoked directly, so importing this module has no side effects. */
const isEntrypoint = process.argv[1]?.endsWith('fetch.ts');
if (isEntrypoint) await main();
