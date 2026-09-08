import { z } from 'zod';
import { EventCategorySchema } from './event.js';

/**
 * Append-only. This is the spine of the birthday recap (1B), "Earlier this year"
 * (1A) and the legacy chapters (4C), so entries are written as finished sentences
 * at the moment they happen — never reconstructed afterwards from stats.
 */
export const HistoryEntrySchema = z.object({
  id: z.string(),
  atAge: z.number().int().min(0),
  category: EventCategorySchema,
  icon: z.string(),
  line: z.string().min(1),
  /** 0..100. Only entries above the chapter threshold reach the legacy screen. */
  significance: z.number().int().min(0).max(100),
  /** Set when the entry came from resolving an event instance. */
  eventInstanceId: z.string().nullable().default(null),
  /** NPCs this entry is about, so a person's screen can filter to their story. */
  npcIds: z.array(z.string()).default([]),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

/** One row of design 4C's "THE WHOLE STORY". */
export const LifeChapterSchema = z.object({
  fromAge: z.number().int(),
  toAge: z.number().int(),
  title: z.string(),
  body: z.string(),
});
export type LifeChapter = z.infer<typeof LifeChapterSchema>;

export const LegacySchema = z.object({
  name: z.string(),
  bornYear: z.number().int(),
  diedYear: z.number().int(),
  age: z.number().int(),
  cityName: z.string(),
  epitaph: z.string(),
  /** One word for the life that just ended. The thing you collect. */
  ribbon: z.object({
    id: z.string(),
    label: z.string(),
    emoji: z.string(),
    line: z.string(),
  }),
  chapters: z.array(LifeChapterSchema),
  /** "His family — Loved, mostly" + the line underneath. */
  howPeopleSawYou: z.array(
    z.object({ who: z.string(), verdict: z.string(), line: z.string(), score: z.number().int() }),
  ),
  /** "What he actually changed" — only things that outlived him. */
  whatYouChanged: z.array(z.object({ icon: z.string(), line: z.string() })),
  /**
   * The ledger, shown for the first and only time.
   *
   * BitLife puts Karma on the gravestone next to Happiness and never mentions
   * it anywhere else, which is exactly right: a number you were never shown is
   * a verdict rather than a dial. `word` is what to call it out loud.
   */
  karma: z.object({ value: z.number().int(), word: z.string(), share: z.number().int() }),
  /** Six figures, exactly as the design lays them out. */
  numbers: z.array(z.object({ value: z.string(), label: z.string() })),
  /** The comparative line: wealthier than N%, happier than N%, remembered by ~N. */
  comparison: z.string(),
  whatYouLeft: z.array(z.string()),
  heirs: z.array(
    z.object({
      npcId: z.string().nullable(),
      name: z.string(),
      emoji: z.string(),
      /** Framed by what they'd be like to play, not by what they inherit. */
      pitch: z.string(),
    }),
  ),
});
export type Legacy = z.infer<typeof LegacySchema>;
