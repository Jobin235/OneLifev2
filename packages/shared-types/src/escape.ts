import { z } from 'zod';

/**
 * The prison maze.
 *
 * BitLife's escape is one screen and one rule: the guard moves twice for every
 * move you make, only ever toward you, and tries horizontally first. That is
 * the entire puzzle — the behaviour is deterministic, so a guard can be walked
 * into a wall and left there. Everything else is dressing.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

const CellSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});
export type Cell = z.infer<typeof CellSchema>;

export const EscapeGameSchema = z.object({
  width: z.number().int().min(3).max(12),
  height: z.number().int().min(3).max(12),
  /**
   * One row per line, one character per cell: '#' is wall, '.' is floor.
   *
   * Stored as strings rather than a nested array because this rides inside a
   * save, and a save that a person can read when something goes wrong is worth
   * more than a few bytes.
   */
  rows: z.array(z.string()),
  player: CellSchema,
  guard: CellSchema,
  exit: CellSchema,
  /** Moves made, so the log can say how close it was. */
  moves: z.number().int().min(0),
  /** Null while it is still going. */
  outcome: z.enum(['escaped', 'caught', 'surrendered']).nullable(),
});
export type EscapeGame = z.infer<typeof EscapeGameSchema>;

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const STEP: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
