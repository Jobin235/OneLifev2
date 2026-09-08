import { z } from 'zod';

/**
 * Organised crime.
 *
 * BitLife's mafia is a career ladder with the serial numbers filed off: you are
 * taken on at eighteen with a record behind you, you rise by earning for people
 * above you, and your cut of what you earn goes up with the rank. What makes it
 * different from the job market is that there is no applying and no leaving.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export const MOB_RANKS = ['associate', 'soldier', 'caporegime', 'underboss', 'godfather'] as const;
export type MobRank = (typeof MOB_RANKS)[number];

export const MOB_TITLES: Record<MobRank, { male: string; female: string }> = {
  associate: { male: 'Associate', female: 'Associate' },
  soldier: { male: 'Soldier', female: 'Soldier' },
  caporegime: { male: 'Caporegime', female: 'Caporegime' },
  underboss: { male: 'Underboss', female: 'Underboss' },
  godfather: { male: 'Godfather', female: 'Godmother' },
};

/** What you keep of what you bring in. BitLife's figures. */
export const MOB_CUT: Record<MobRank, number> = {
  associate: 0.1,
  soldier: 0.1,
  caporegime: 0.25,
  underboss: 0.5,
  godfather: 0.75,
};

export const MobStandingSchema = z.object({
  /** "the Cavallo family". */
  family: z.string().min(1),
  rank: z.enum(MOB_RANKS),
  title: z.string().min(1),
  /**
   * How the people above you see you, 0..100. Promotion reads this and years
   * served; nothing else does.
   */
  standing: z.number().int().min(0).max(100),
  /** What you have brought in for them, in cents. The only number they respect. */
  earned: z.number().int().min(0),
  joinedAtAge: z.number().int().min(0),
  /** Years at the current rank, which is half of what promotion turns on. */
  yearsAtRank: z.number().int().min(0),
  /**
   * Whether they have made you.
   *
   * You are not a soldier until you have killed somebody for them and taken the
   * oath, which is the one hard gate in the ladder and the reason an associate
   * can sit at the bottom for a whole life without ever being asked.
   */
  made: z.boolean(),
  /** Jobs done this year, so the screen can cap them. */
  jobsThisYear: z.number().int().min(0),
});
export type MobStanding = z.infer<typeof MobStandingSchema>;
