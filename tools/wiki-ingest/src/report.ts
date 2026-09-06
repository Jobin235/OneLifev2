import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadContent } from '@lineage/content';
import type { ReferenceIndex } from './extract.ts';
import { SOURCES } from './sources.ts';

/**
 * The only stage a human reads.
 *
 * It answers one question — "what have we not thought of?" — and produces a list
 * to write into. It does not produce content, and there is deliberately no
 * `--apply` flag: the step from a gap to an event is a writing job.
 */

const OUT = new URL('../out/', import.meta.url).pathname;

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const main = async () => {
  let index: ReferenceIndex;
  try {
    index = JSON.parse(await readFile(join(OUT, 'index.json'), 'utf8')) as ReferenceIndex;
  } catch {
    console.error('No out/index.json — run `npm run fetch && npm run extract` first.');
    process.exit(1);
  }

  const content = loadContent();

  // Everything we already have, flattened for comparison.
  const ours = new Set<string>();
  for (const track of content.careers) {
    ours.add(normalise(track.label));
    ours.add(normalise(track.industry));
    for (const rung of track.rungs) ours.add(normalise(rung.title));
  }
  for (const activity of content.activities) ours.add(normalise(activity.label));
  for (const event of content.events) {
    ours.add(normalise(event.id.replace(/_/g, ' ')));
    for (const tag of event.tags) ours.add(normalise(tag));
  }

  const lines: string[] = [
    '# Coverage report',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} from ${index.sources.length} source(s).`,
    '',
    'This is a checklist of things other life simulators model that we do not.',
    'It is **not** a to-do list — most gaps are not worth filling. The question for',
    'each one is the only question that matters: *does this make a life more',
    'interesting?* If not, cross it off and move on.',
    '',
    '**Nothing here is content.** Every line is a label or a number. Writing the',
    'event is a separate job, done in our own voice, from scratch.',
    '',
    '## What we have now',
    '',
    `- ${content.events.length} events across ${new Set(content.events.map((e) => e.category)).size} categories`,
    `- ${content.careers.length} career ladders, ${content.careers.reduce((n, c) => n + c.rungs.length, 0)} rungs`,
    `- ${content.activities.length} activities`,
    `- ${content.countries.length} country packs`,
    `- ${content.traits.length} traits`,
    '',
  ];

  const byCategory = new Map<string, Set<string>>();

  for (const source of index.sources) {
    lines.push(`## ${source.label}`, '');

    for (const [category, titles] of Object.entries(source.categories)) {
      const missing = titles.filter((title) => !ours.has(normalise(title)));
      if (missing.length === 0) continue;
      const bucket = byCategory.get(category) ?? new Set<string>();
      for (const title of missing) bucket.add(title);
      byCategory.set(category, bucket);
    }

    for (const [title, phrases] of Object.entries(source.phrases)) {
      const missing = phrases.filter((phrase) => !ours.has(normalise(phrase)));
      if (missing.length === 0) continue;
      const bucket = byCategory.get(title) ?? new Set<string>();
      for (const phrase of missing) bucket.add(phrase);
      byCategory.set(title, bucket);
    }

    if (Object.keys(source.numbers).length > 0) {
      lines.push('### Numeric ranges seen', '');
      lines.push('| Keyword | Min | Max | Samples |', '| --- | --- | --- | --- |');
      for (const [keyword, range] of Object.entries(source.numbers)) {
        lines.push(`| ${keyword} | ${range.min} | ${range.max} | ${range.samples} |`);
      }
      lines.push('');
      lines.push(
        'Useful only as a sanity check on our own bands — their economy is not ours,',
        'and our figures are already tuned against the design file.',
        '',
      );
    }
  }

  lines.push('## Gaps, by area', '');
  const sorted = [...byCategory.entries()].sort((a, b) => b[1].size - a[1].size);
  for (const [category, items] of sorted) {
    lines.push(`### ${category} — ${items.size} not modelled`, '');
    for (const item of [...items].sort().slice(0, 60)) lines.push(`- [ ] ${item}`);
    if (items.size > 60) lines.push(`- …and ${items.size - 60} more`);
    lines.push('');
  }

  lines.push(
    '## Known systemic gaps',
    '',
    'These are ours, not theirs — found by playing, not by scraping:',
    '',
    '- [ ] Graduate education has no path, so medicine and law are unreachable',
    '- [ ] Military service (several country packs declare it and nothing uses it)',
    '- [ ] Addiction and recovery (habits exist; there is no arc)',
    '- [ ] Religion and community',
    '- [ ] Adoption, fostering, step-families',
    '- [ ] Emigration between country packs mid-life',
    '- [ ] The sports ladder has a career track and no events',
    '- [ ] Fame has two events; design 5E implies a system',
    '',
    '## Sources',
    '',
    ...SOURCES.map((s) => `- ${s.label} — \`${s.api}\` (CC-BY-SA; structure only)`),
    '',
    'Guides without an open licence are read by a human in a browser and are',
    'deliberately not fetched by this tool. See `HUMAN_READING_ONLY` in sources.ts.',
    '',
  );

  await writeFile(join(OUT, 'coverage.md'), lines.join('\n'));
  console.log(`→ out/coverage.md (${sorted.length} areas with gaps)`);
};

/** Only run when invoked directly, so importing this module has no side effects. */
const isEntrypoint = process.argv[1]?.endsWith('report.ts');
if (isEntrypoint) await main();
