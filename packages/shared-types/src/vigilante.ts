import { z } from 'zod';

/**
 * The other life.
 *
 * Not a BitLife pack — this one was asked for directly — so it is built around
 * the thing that makes a mask worth having rather than around a menu: there are
 * two lives, and the interesting number is how close the first one is to
 * finding out about the second.
 */

export const VigilanteSchema = z.object({
  /** What the papers settled on calling you. */
  alias: z.string().min(1),
  sinceAge: z.number().int().min(0),
  /**
   * What the city makes of you, 0..100. Set by how you handle people rather
   * than how many: handing somebody to the police plays better than putting
   * them in hospital, and the city is the only judge of that.
   */
  standing: z.number().int().min(0).max(100),
  /**
   * How close anybody is to working out who you are, 0..100.
   *
   * The real meter. Every night out raises it, a quiet year lowers it, and at
   * a hundred somebody puts it together — which does not kill you, it ends the
   * other life instead, which is worse.
   */
  suspicion: z.number().int().min(0).max(100),
  /** People you got home, and people you did not. */
  saved: z.number().int().min(0),
  broken: z.number().int().min(0),
  gearIds: z.array(z.string()),
  nightsThisYear: z.number().int().min(0).default(0),
  /** Once this is true it stays true. */
  unmasked: z.boolean().default(false),
});
export type Vigilante = z.infer<typeof VigilanteSchema>;
