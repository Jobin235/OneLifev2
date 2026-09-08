import type { GameConfig } from '@lineage/config';
import {
  DIRECTIONS,
  STEP,
  clampStat,
  type Cell,
  type Direction,
  type EscapeGame,
  type LifeState,
} from '@lineage/shared-types';
import {
  checkInvariants,
  makeId,
  makeRng,
  pushHistory,
  refreshDerived,
} from '@lineage/simulation';

/**
 * Going over the wall.
 *
 * The one place in this game where the player is asked to be good at something
 * rather than to choose something. BitLife's escape is a grid, an exit, and a
 * guard who moves twice for every move you make, only toward you, horizontally
 * first — deterministic, so he can be walked into a wall and abandoned there.
 * That determinism is the puzzle and is preserved exactly.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class EscapeRejected extends Error {}

const WALL = '#';
const FLOOR = '.';

const at = (game: EscapeGame, x: number, y: number): string => {
  if (x < 0 || y < 0 || y >= game.rows.length) return WALL;
  const row = game.rows[y]!;
  if (x >= row.length) return WALL;
  return row[x]!;
};

const open = (game: EscapeGame, x: number, y: number): boolean => at(game, x, y) === FLOOR;
const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

/* ------------------------------------------------------------------ *
 * Building one
 * ------------------------------------------------------------------ */

/**
 * How big, from what you did.
 *
 * BitLife scales the grid with the security level: four by four for something
 * petty, eight by eight for maximum security. Ours reads the sentence, which is
 * the same information stated in the units this game already has.
 */
export const mazeSizeFor = (totalYears: number): number => {
  if (totalYears <= 2) return 4;
  if (totalYears <= 5) return 5;
  if (totalYears <= 10) return 6;
  if (totalYears <= 20) return 7;
  return 8;
};


/** Every floor cell, in reading order. */
const floors = (rows: string[]): Cell[] => {
  const out: Cell[] = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y]!.length; x++) {
      if (rows[y]![x] === FLOOR) out.push({ x, y });
    }
  }
  return out;
};

/** Shortest-path distance in steps, or Infinity when there is no way through. */
export const distance = (game: EscapeGame, from: Cell, to: Cell): number => {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  let frontier: Cell[] = [from];
  let steps = 0;

  while (frontier.length > 0) {
    if (frontier.some((c) => same(c, to))) return steps;
    const next: Cell[] = [];
    for (const cell of frontier) {
      for (const d of DIRECTIONS) {
        const n = { x: cell.x + STEP[d].x, y: cell.y + STEP[d].y };
        const key = `${n.x},${n.y}`;
        if (seen.has(key) || !open(game, n.x, n.y)) continue;
        seen.add(key);
        next.push(n);
      }
    }
    frontier = next;
    steps += 1;
  }
  return Infinity;
};

/**
 * The shortest sequence of moves that reaches the door, or null when there is
 * none.
 *
 * The guard is deterministic, so the whole game is a finite graph: a position
 * is the player's square and the guard's square, and there are at most 4096 of
 * them on the largest grid. Breadth-first over that graph answers "can this be
 * won" exactly — and answers it with the line, which is what makes it useful
 * for more than a yes.
 */
export const winningLine = (game: EscapeGame): Direction[] | null => {
  const key = (p: Cell, g: Cell) => `${p.x},${p.y}|${g.x},${g.y}`;
  const start = { player: game.player, guard: game.guard, path: [] as Direction[] };
  const seen = new Set<string>([key(start.player, start.guard)]);
  let frontier = [start];

  for (let depth = 0; depth < 400 && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const here of frontier) {
      for (const d of DIRECTIONS) {
        const player = { x: here.player.x + STEP[d].x, y: here.player.y + STEP[d].y };
        if (!open(game, player.x, player.y)) continue;
        if (same(player, game.exit)) return [...here.path, d];
        if (same(player, here.guard)) continue;

        // The guard chases the square the player just moved to.
        const probe = { ...game, player };
        let guard = here.guard;
        let taken = false;
        for (let i = 0; i < 2; i++) {
          guard = guardStep(probe, guard);
          if (same(guard, player)) taken = true;
        }
        if (taken) continue;

        const k = key(player, guard);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ player, guard, path: [...here.path, d] });
      }
    }
    frontier = next;
  }
  return null;
};

/**
 * Whether a maze can actually be won. Every maze handed to a player has been
 * through this: an unsolvable puzzle is not a hard puzzle, it is a bug with a
 * timer on it.
 */
export const solvable = (game: EscapeGame): boolean => winningLine(game) !== null;

/**
 * Sets one up.
 *
 * A grid of tiles with some of them blocked, which is the shape BitLife
 * actually uses — walls are squares you cannot stand on, not edges between
 * squares. A carved maze was the first attempt and was wrong twice over: it
 * doubled the grid to fit its wall cells, so a "four by four" arrived as
 * nine by nine on a phone screen, and its corridors gave a player nowhere to
 * dodge a guard who moves twice.
 *
 * Generation retries until the result is winnable, which is checked rather
 * than assumed.
 */
export const buildMaze = (totalYears: number, seed: string, salt: string | number): EscapeGame => {
  const size = mazeSizeFor(totalYears);

  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = makeRng(seed, 'escape', salt, attempt);
    /*
     * Denser walls on the bigger grids. An eight by eight of open floor is not
     * harder than a four by four, it is just longer — the difficulty in this
     * puzzle comes from having somewhere to be cornered.
     */
    const density = 0.16 + size * 0.02;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
      let row = '';
      for (let x = 0; x < size; x++) row += rng.chance(density) ? WALL : FLOOR;
      rows.push(row);
    }

    const game: EscapeGame = {
      width: size,
      height: size,
      rows,
      player: { x: 0, y: 0 },
      guard: { x: 0, y: 0 },
      exit: { x: 0, y: 0 },
      moves: 0,
      outcome: null,
    };

    const cells = floors(rows);
    if (cells.length < size * size * 0.6) continue;

    // Start in a corner-ish square, so the exit has somewhere far to be.
    const start = cells.find((c) => c.x + c.y <= 1) ?? cells[0]!;
    game.player = start;

    const reachable = cells.filter((c) => Number.isFinite(distance(game, start, c)));
    if (reachable.length < cells.length * 0.8) continue;

    const furthest = reachable.reduce(
      (best, c) => {
        const d = distance(game, start, c);
        return d > best.d ? { cell: c, d } : best;
      },
      { cell: start, d: -1 },
    );
    if (furthest.d < size) continue;
    game.exit = furthest.cell;

    /*
     * The guard starts between you and the door rather than beside either: a
     * guard next to the exit makes every maze a coin flip, and one next to the
     * player makes it a formality.
     */
    const guardOptions = reachable.filter(
      (c) =>
        !same(c, game.exit) &&
        !same(c, start) &&
        distance(game, start, c) >= 2 &&
        distance(game, game.exit, c) >= 2,
    );
    if (guardOptions.length === 0) continue;
    game.guard = rng.pick(guardOptions);

    if (solvable(game)) return game;
  }

  /*
   * Sixty failures in a row is not a maze this seed can produce, so hand back
   * one that is trivially winnable rather than throwing: a player in a cell is
   * owed a puzzle, not an error.
   */
  const rows = Array.from({ length: size }, () => FLOOR.repeat(size));
  return {
    width: size,
    height: size,
    rows,
    player: { x: 0, y: 0 },
    guard: { x: size - 1, y: 0 },
    exit: { x: 0, y: size - 1 },
    moves: 0,
    outcome: null,
  };
};

/* ------------------------------------------------------------------ *
 * The guard
 * ------------------------------------------------------------------ */

/**
 * One guard step.
 *
 * Toward the player, horizontally first, and standing still when both ways are
 * blocked. This is BitLife's rule verbatim and it is not an approximation of
 * pathfinding — it is the whole game. A guard that took the shortest path would
 * be unbeatable, because he takes two steps to your one.
 */
export const guardStep = (game: EscapeGame, from: Cell): Cell => {
  const dx = game.player.x - from.x;
  const dy = game.player.y - from.y;

  const tries: Cell[] = [];
  if (dx !== 0) tries.push({ x: from.x + Math.sign(dx), y: from.y });
  if (dy !== 0) tries.push({ x: from.x, y: from.y + Math.sign(dy) });

  for (const cell of tries) {
    if (open(game, cell.x, cell.y)) return cell;
  }
  return from;
};

/* ------------------------------------------------------------------ *
 * Playing it
 * ------------------------------------------------------------------ */

export interface EscapeResult {
  state: LifeState;
  game: EscapeGame;
  /** Said out loud when the maze ends, and empty while it is still going. */
  line: string;
}

/** Starts one. Only from inside, and only once a year. */
export const startEscape = (state: LifeState, config: GameConfig): LifeState => {
  const inside = state.character.record.incarceration;
  if (!inside) throw new EscapeRejected('you are not in prison');
  if (!state.character.alive) throw new EscapeRejected('a dead character cannot escape');
  if (state.activeEvent) throw new EscapeRejected('answer the open decision first');
  if (state.escape && state.escape.outcome === null) {
    throw new EscapeRejected('you are already halfway over the wall');
  }
  if (Number(state.flags.escape_attempts_this_year ?? 0) >= 1) {
    throw new EscapeRejected('the yard is watched now; try again next year');
  }

  const before = structuredClone(state);
  try {
    state.flags.escape_attempts_this_year = 1;
    state.step += 1;
    state.escape = buildMaze(
      inside.totalYears,
      state.seed,
      `${state.character.age}:${inside.yearsServed}`,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/**
 * One move: yours, then the guard's two.
 *
 * The order matters and is BitLife's. Reaching the door ends it before the
 * guard moves at all, which is what makes the last step of a good run feel
 * like getting away with something.
 */
export const escapeMove = (
  state: LifeState,
  direction: Direction,
  config: GameConfig,
): EscapeResult => {
  const game = state.escape;
  if (!game) throw new EscapeRejected('there is no way out in front of you');
  if (game.outcome) throw new EscapeRejected('that is over');

  const before = structuredClone(state);
  try {
    const next = {
      x: game.player.x + STEP[direction].x,
      y: game.player.y + STEP[direction].y,
    };
    if (!open(game, next.x, next.y)) throw new EscapeRejected('there is a wall there');

    game.player = next;
    game.moves += 1;
    state.step += 1;

    if (same(game.player, game.exit)) {
      const line = escaped(state, config);
      refreshDerived(state, config);
      checkInvariants(state, before);
      return { state, game, line };
    }

    // Walking into him is being caught by him.
    if (same(game.player, game.guard)) {
      const line = caught(state, config, 'caught');
      refreshDerived(state, config);
      checkInvariants(state, before);
      return { state, game, line };
    }

    for (let i = 0; i < 2; i++) {
      game.guard = guardStep(game, game.guard);
      if (same(game.guard, game.player)) {
        const line = caught(state, config, 'caught');
        refreshDerived(state, config);
        checkInvariants(state, before);
        return { state, game, line };
      }
    }

    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, game, line: '' };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** Walking back with your hands up. Costs the same as being caught. */
export const surrender = (state: LifeState, config: GameConfig): EscapeResult => {
  const game = state.escape;
  if (!game || game.outcome) throw new EscapeRejected('there is nothing to give up on');

  const before = structuredClone(state);
  try {
    state.step += 1;
    const line = caught(state, config, 'surrendered');
    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, game, line };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

const escaped = (state: LifeState, config: GameConfig): string => {
  const inside = state.character.record.incarceration;
  const game = state.escape!;
  game.outcome = 'escaped';

  const facility = inside?.facility ?? 'the prison';
  const served = inside?.yearsServed ?? 0;
  state.character.record.incarceration = null;
  state.flags.escaped_prison = true;
  state.character.stats.happiness = clampStat(state.character.stats.happiness + 20);

  const line = `You went over the wall at ${facility} after ${served} ${served === 1 ? 'year' : 'years'}. Nobody stopped you.`;
  pushHistory(state, 'crime', '🏃', line, 95);
  void config;
  return line;
};

const caught = (
  state: LifeState,
  config: GameConfig,
  how: 'caught' | 'surrendered',
): string => {
  const game = state.escape!;
  game.outcome = how;

  const inside = state.character.record.incarceration;
  if (!inside) return 'It was over before it started.';

  /*
   * BitLife adds a couple of years and the felony "Attempted escape". Giving
   * yourself up costs less than being dragged back, which is the only reason
   * the surrender button is worth having.
   */
  const added = how === 'surrendered' ? 1 : 3;
  inside.totalYears += added;
  inside.paroleEligibleIn += added;
  inside.behaviour = clampStat(inside.behaviour - (how === 'surrendered' ? 15 : 35));
  state.character.record.convictions.push({
    id: makeId('conv', state.seed, 'escape', state.character.age),
    offence: 'Attempted escape',
    atAge: state.character.age,
    sentenceYears: added,
    fine: 0,
    spent: false,
  });
  state.character.stats.happiness = clampStat(state.character.stats.happiness - 12);

  const line =
    how === 'surrendered'
      ? `You gave yourself up in the corridor. ${added} more ${added === 1 ? 'year' : 'years'}, and they will be watching.`
      : `They had you against the wall before you reached the door. ${added} more years.`;
  pushHistory(state, 'crime', '🚨', line, 70);
  void config;
  return line;
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export interface EscapeView {
  width: number;
  height: number;
  /** One string per row, ready to render cell by cell. */
  rows: string[];
  player: Cell;
  guard: Cell;
  exit: Cell;
  moves: number;
  outcome: string | null;
  /** Which of the four moves are not into a wall. */
  legal: Direction[];
}

export const escapeView = (state: LifeState): EscapeView | null => {
  const game = state.escape;
  if (!game) return null;
  return {
    width: game.width,
    height: game.height,
    rows: game.rows,
    player: game.player,
    guard: game.guard,
    exit: game.exit,
    moves: game.moves,
    outcome: game.outcome,
    legal:
      game.outcome !== null
        ? []
        : DIRECTIONS.filter((d) =>
            open(game, game.player.x + STEP[d].x, game.player.y + STEP[d].y),
          ),
  };
};
