import { z } from 'zod';

/**
 * Being born to it, or marrying in.
 *
 * BitLife's royal update is one of the few things in the game that is not
 * earned: it is handed to a small fraction of characters at birth in the
 * countries that have a monarchy, and everybody else has to marry one of them.
 * What makes it a system rather than a badge is that the position can be lost —
 * respect falls when a royal behaves like one, and at nothing the subjects take
 * the title back. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

/**
 * The ladder, lowest first. Only the top two below the crown are in the line of
 * succession; a baron waits forever, which is the point of being a baron.
 */
export const ROYAL_RANKS = [
  'baron',
  'viscount',
  'earl',
  'marquess',
  'duke',
  'prince',
  'monarch',
] as const;
export type RoyalRank = (typeof ROYAL_RANKS)[number];

/** Both forms, because a title is one of the few things in a life that is gendered. */
export const ROYAL_TITLES: Record<RoyalRank, { male: string; female: string }> = {
  baron: { male: 'Baron', female: 'Baroness' },
  viscount: { male: 'Viscount', female: 'Viscountess' },
  earl: { male: 'Earl', female: 'Countess' },
  marquess: { male: 'Marquess', female: 'Marchioness' },
  duke: { male: 'Duke', female: 'Duchess' },
  prince: { male: 'Prince', female: 'Princess' },
  monarch: { male: 'King', female: 'Queen' },
};

export const RoyalStandingSchema = z.object({
  rank: z.enum(ROYAL_RANKS),
  /** "Princess", "Queen" — the gendered form, resolved once at the point of grant. */
  title: z.string().min(1),
  /** "the House of Rosenholm". Kept so the log can name what you belong to. */
  house: z.string().min(1),
  /** How it was come by, which the log says out loud and the ribbons read. */
  by: z.enum(['birth', 'marriage', 'succession']),
  /**
   * What the country thinks of you, 0..100.
   *
   * The whole system is this number. Royal duties raise it, abusing the
   * position lowers it, and at zero the subjects revolt and take the title
   * back — from you and from whoever you married.
   */
  respect: z.number().int().min(0).max(100),
  /**
   * How many people are ahead of you. 0 means the crown passes to you the next
   * time it falls vacant. Only princes have a number at all; everybody else is
   * out of the line and this stays null.
   */
  inLine: z.number().int().min(0).nullable(),
  /** The age they took the throne, or null. */
  crownedAtAge: z.number().int().min(0).nullable(),
  /** Royal duties performed this year, so the screen can cap them. */
  dutiesThisYear: z.number().int().min(0).default(0),
});
export type RoyalStanding = z.infer<typeof RoyalStandingSchema>;
