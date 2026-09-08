import { z } from 'zod';

/**
 * Something you own and run.
 *
 * Three of BitLife's expansion packs — the cult, the zoo and the spy agency —
 * are the same machine wearing different nouns: you buy premises with a
 * capacity, you fill them with things that have to be acquired one at a time,
 * you keep a meter up or the things leave, and the whole thing pays out once a
 * year against its upkeep. Building three of those separately would be writing
 * the same file three times and getting it slightly different each time.
 *
 * What differs is the nouns, the numbers, and one bespoke action apiece, and
 * all of that is content. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export const VENTURE_KINDS = ['cult', 'zoo', 'agency'] as const;
export type VentureKind = (typeof VENTURE_KINDS)[number];

/** One follower, animal or agent. */
export const VentureMemberSchema = z.object({
  id: z.string(),
  /** The type from the content pack: 'tiger', 'devotee', 'cryptographer'. */
  typeId: z.string(),
  /** "Tiger", "Marisol Okafor" — what the list shows. */
  label: z.string().min(1),
  emoji: z.string().min(1),
  /** 0..100. How good this one is at whatever it is for. */
  quality: z.number().int().min(0).max(100),
  sinceAge: z.number().int().min(0),
});
export type VentureMember = z.infer<typeof VentureMemberSchema>;

export const VentureSchema = z.object({
  id: z.string(),
  kind: z.enum(VENTURE_KINDS),
  /** "the Order of the Quiet Morning", "Hollowbrook Zoo". */
  name: z.string().min(1),
  /** Which tier of premises, from the content pack. */
  tierId: z.string().min(1),
  capacity: z.number().int().min(1),
  /**
   * The place itself, 0..100. Upgrades raise it; nothing lowers it. What it
   * buys is the calibre of what will come and how content they are to stay.
   */
  appeal: z.number().int().min(0).max(100),
  /**
   * How the members feel about being here, 0..100. This is the meter the
   * player actually plays: it decays every year, the things you do raise it,
   * and at the floor the members start leaving.
   */
  morale: z.number().int().min(0).max(100),
  members: z.array(VentureMemberSchema),
  /** Upgrade ids already bought, so the list can show them as owned. */
  upgradeIds: z.array(z.string()),
  foundedAtAge: z.number().int().min(0),
  /** Actions taken this year, so the screen can cap them. */
  actionsThisYear: z.number().int().min(0).default(0),
  /** What it made or lost last year, for the screen to state plainly. */
  lastYear: z.number().int().default(0),
});
export type Venture = z.infer<typeof VentureSchema>;
