import type { GameConfig } from '@lineage/config';
import type { HistoryEntry, LifeChapter, LifeState } from '@lineage/shared-types';

/**
 * Design 4C's "THE WHOLE STORY": a life divided into a handful of chapters, each
 * built from the entries that actually mattered in that stretch.
 */
export const buildChapters = (state: LifeState, config: GameConfig): LifeChapter[] => {
  const finalAge = state.character.deathAge ?? state.character.age;
  const significant = state.history.filter(
    (e) => e.significance >= config.legacy.chapterSignificanceThreshold,
  );

  const spans = chapterSpans(finalAge, config.legacy.chapterCount);

  return spans.map(([fromAge, toAge]) => {
    const entries = significant.filter((e) => e.atAge >= fromAge && e.atAge <= toAge);
    return {
      fromAge,
      toAge,
      title: chapterTitle(fromAge, toAge, entries),
      body: entries.length > 0 ? entries.map((e) => e.line).join(' ') : quietChapter(fromAge, toAge),
    };
  });
};

const chapterSpans = (finalAge: number, count: number): Array<[number, number]> => {
  // Childhood is always its own chapter; the rest of the life is split evenly.
  const spans: Array<[number, number]> = [[0, Math.min(17, finalAge)]];
  if (finalAge <= 18) return spans;

  const remaining = finalAge - 18;
  const step = Math.max(1, Math.ceil(remaining / (count - 1)));
  for (let start = 18; start <= finalAge; start += step) {
    spans.push([start, Math.min(finalAge, start + step - 1)]);
  }
  return spans.slice(0, count);
};

const chapterTitle = (fromAge: number, _toAge: number, entries: HistoryEntry[]): string => {
  if (entries.length === 0) return 'Years that passed';
  const categories = new Map<string, number>();
  for (const entry of entries) categories.set(entry.category, (categories.get(entry.category) ?? 0) + 1);
  const dominant = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]![0];

  const titles: Record<string, string[]> = {
    childhood: ['A small house and a long street', 'Before any of it was your fault'],
    education: ['School, and what it decided', 'The exam years'],
    career: ['Work, and one big refusal', 'The years that made your name', 'Building something'],
    relationship: ['The person who stayed', 'Falling in and out'],
    family: ['A house that got louder', 'Raising them'],
    business: ['One van, then six', 'Your own thing'],
    money: ['The lean years', 'Coming into money'],
    crime: ['The wrong favour', 'What it cost you'],
    prison: ['Three years, and everything after'],
    politics: ['Getting involved locally'],
    health: ['The body catching up'],
    fame: ['Being recognised'],
    world: ['When it all got more expensive'],
    random: ['Things that just happened'],
  };
  const pool = titles[dominant] ?? ['Years'];
  return pool[fromAge % pool.length]!;
};

const quietChapter = (fromAge: number, toAge: number): string =>
  `Nothing much is recorded between ${fromAge} and ${toAge}. Most years are like that.`;
