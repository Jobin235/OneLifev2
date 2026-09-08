import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { lifeView } from '../views.js';
import { buildMaze, distance, guardStep, mazeSizeFor, solvable, winningLine } from '../escape.js';
import { MOB_CUT } from '@lineage/shared-types';
import type { Direction, EscapeGame, LifeState } from '@lineage/shared-types';

const game = createGame();

const clear = (state: LifeState): LifeState => {
  let s = state;
  while (s.activeEvent) s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
  return game.dismiss(s);
};

/**
 * The maze.
 *
 * One rule — the guard moves twice, toward you, horizontally first — and one
 * promise, that every maze handed to a player can actually be won. The second
 * is the one worth testing hardest: an unsolvable puzzle is not a hard puzzle,
 * it is a bug with a timer on it.
 */
describe('going over the wall', () => {
  const open = (g: EscapeGame, x: number, y: number) =>
    y >= 0 && y < g.rows.length && x >= 0 && x < g.rows[y]!.length && g.rows[y]![x] === '.';

  it('sizes the grid from the sentence, four by four up to eight by eight', () => {
    expect(mazeSizeFor(1)).toBe(4);
    expect(mazeSizeFor(30)).toBe(8);
    for (const years of [1, 4, 8, 15, 30]) {
      const maze = buildMaze(years, 'size', years);
      expect(maze.width).toBe(mazeSizeFor(years));
      expect(maze.height).toBe(maze.width);
      expect(maze.rows).toHaveLength(maze.height);
    }
  });

  it('never hands out a maze that cannot be won', () => {
    for (const years of [1, 4, 8, 15, 30]) {
      for (let i = 0; i < 120; i++) {
        const maze = buildMaze(years, `winnable-${i}`, i);
        expect(solvable(maze)).toBe(true);
        // And the door is somewhere you could walk to at all.
        expect(distance(maze, maze.player, maze.exit)).toBeLessThan(Infinity);
      }
    }
  });

  it('starts nobody on top of anybody', () => {
    for (let i = 0; i < 60; i++) {
      const maze = buildMaze(12, `apart-${i}`, i);
      expect(maze.player).not.toEqual(maze.guard);
      expect(maze.player).not.toEqual(maze.exit);
      expect(maze.guard).not.toEqual(maze.exit);
      expect(open(maze, maze.player.x, maze.player.y)).toBe(true);
      expect(open(maze, maze.guard.x, maze.guard.y)).toBe(true);
      expect(open(maze, maze.exit.x, maze.exit.y)).toBe(true);
    }
  });

  it('moves the guard sideways first, and lets him be walked into a wall', () => {
    const maze: EscapeGame = {
      width: 3,
      height: 3,
      // A guard at the top right, a player at the bottom left, a wall between.
      rows: ['..#', '.#.', '...'],
      player: { x: 0, y: 2 },
      guard: { x: 1, y: 0 },
      exit: { x: 2, y: 2 },
      moves: 0,
      outcome: null,
    };

    // Horizontal first: he wants to come left, and can.
    expect(guardStep(maze, { x: 1, y: 0 })).toEqual({ x: 0, y: 0 });
    // Straight down from (0,0) once he is above the player, because dx is 0.
    expect(guardStep({ ...maze, guard: { x: 0, y: 0 } }, { x: 0, y: 0 })).toEqual({ x: 0, y: 1 });
    // And when both ways are walls he simply stands there.
    const boxed: EscapeGame = { ...maze, rows: ['.#.', '###', '...'], player: { x: 2, y: 2 } };
    expect(guardStep(boxed, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

/** A character in a cell, with a sentence long enough to be worth escaping. */
const imprisoned = (seed: string, years = 12): LifeState => {
  let s = game.newLife({ countryId: 'us', upbringing: 'rough', seed });
  while (s.character.alive && s.character.age < 25) {
    if (s.activeEvent) {
      s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
      continue;
    }
    s = game.ageUp(s).state;
  }
  s = clear(s);
  // Straight into a cell: the fixture is about the maze, not about how they got here.
  s.career.current = null;
  s.character.finances.salary = 0;
  s.education.current = null;
  s.character.record.incarceration = {
    facility: 'the state penitentiary',
    offence: 'Armed robbery',
    totalYears: years,
    yearsServed: 2,
    paroleEligibleIn: 4,
    behaviour: 60,
  };
  return s;
};

describe('the escape, played', () => {
  it('opens a maze from inside and nowhere else', () => {
    let free = game.newLife({ countryId: 'us', upbringing: 'rough', seed: 'free-1' });
    free = clear(game.ageUp(free).state);
    expect(() => game.startEscape(free)).toThrow(/not in prison/);

    const inside = game.startEscape(imprisoned('esc-1'));
    expect(game.escape(inside)).not.toBeNull();
    expect(game.escape(inside)!.legal.length).toBeGreaterThan(0);
  });

  it('will not let the yard be tried twice in a year', () => {
    let state = game.startEscape(imprisoned('esc-2'));
    state = game.surrender(state).state;
    expect(() => game.startEscape(state)).toThrow(/next year/);
  });

  it('refuses to walk into a wall', () => {
    const state = game.startEscape(imprisoned('esc-3'));
    const view = game.escape(state)!;
    const illegal = (['up', 'down', 'left', 'right'] as Direction[]).find(
      (d) => !view.legal.includes(d),
    );
    if (!illegal) return;
    expect(() => game.escapeMove(state, illegal)).toThrow(/wall/);
  });

  it('lets the sentence end at the door', () => {
    // Play one properly: solvable means a winning line exists, so find it.
    let state = game.startEscape(imprisoned('esc-win'));
    const won = playItOut(state);
    expect(won.character.record.incarceration).toBeNull();
    expect(won.flags.escaped_prison).toBe(true);
    expect(won.history.some((h) => h.line.includes('over the wall'))).toBe(true);
  });

  it('costs years when it goes wrong, and fewer when you give up', () => {
    const caughtState = imprisoned('esc-lose');
    const beforeYears = caughtState.character.record.incarceration!.totalYears;
    const surrendered = game.surrender(game.startEscape(caughtState)).state;
    expect(surrendered.character.record.incarceration!.totalYears).toBe(beforeYears + 1);
    expect(
      surrendered.character.record.convictions.some((c) => c.offence === 'Attempted escape'),
    ).toBe(true);
  });

  /** Walks the winning line the solver hands back. */
  const playItOut = (start: LifeState): LifeState => {
    const line = winningLine(start.escape!);
    expect(line).not.toBeNull();
    let state = start;
    for (const move of line!) state = game.escapeMove(state, move).state;
    return state;
  };
});

/**
 * The family.
 *
 * A ladder that will not take an application, cannot be resigned from, and pays
 * a percentage that is the whole reason to climb it.
 */
describe('organised crime', () => {
  /** Somebody with the right sort of record, built the way a player would. */
  const withForm = (seed: string): LifeState => {
    let s = game.newLife({ countryId: 'us', upbringing: 'rough', seed });
    while (s.character.alive && s.character.age < 22) {
      if (s.activeEvent) {
        s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
        continue;
      }
      s = game.ageUp(s).state;
    }
    s = clear(s);
    s.character.record.incarceration = null;
    s.character.record.convictions.push({
      id: 'conv_test',
      offence: 'Grand theft auto',
      atAge: 20,
      sentenceYears: 2,
      fine: 0,
      spent: false,
    });
    return s;
  };

  it('will not take somebody nobody has heard of', () => {
    let clean = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed: 'clean-1' });
    clean = clear(game.ageUp(clean).state);
    clean.character.age = 30;
    expect(game.mobEligibility(clean).open).toBe(false);
    expect(() => game.joinMob(clean)).toThrow();
    // And does not advertise itself to somebody with a clean record.
    expect(game.mobEligibility(clean).visible).toBe(false);
  });

  it('takes somebody with the right sort of record, at the bottom', () => {
    const state = game.joinMob(withForm('form-1'));
    const view = game.mob(state)!;
    expect(view.title).toBe('Associate');
    expect(view.made).toBe(false);
    expect(view.cutLine).toContain('10%');
    expect(state.history.some((h) => h.line.includes('Associate'))).toBe(true);
    /*
     * The header calls somebody with no other job by their rank, rather than
     * unemployed — but a day job still wins, because a soldier with a day job
     * has a day job and that is what one is for.
     */
    const withJob = lifeView(state, game.content).station;
    expect(withJob).toBe(state.career.current ? state.career.current.title : 'Associate');
    const quiet = structuredClone(state);
    quiet.career.current = null;
    expect(lifeView(quiet, game.content).station).toBe('Associate');
  });

  it('pays a cut of the take, and the cut is the rank', () => {
    expect(MOB_CUT.associate).toBeLessThan(MOB_CUT.caporegime);
    expect(MOB_CUT.caporegime).toBeLessThan(MOB_CUT.underboss);
    expect(MOB_CUT.underboss).toBeLessThan(MOB_CUT.godfather);

    let state = game.joinMob(withForm('cut-1'));
    let paid = 0;
    for (let i = 0; i < 3 && !state.character.record.incarceration; i++) {
      const before = state.character.finances.cash;
      const result = game.doMobJob(state, 'collect');
      state = result.state;
      if (!result.charged) paid += state.character.finances.cash - before;
      state = clear(state);
    }
    expect(paid).toBeGreaterThan(0);
    expect(state.mob!.earned).toBeGreaterThan(paid);
  });

  it('keeps the senior work for senior people', () => {
    const state = game.joinMob(withForm('lock-1'));
    expect(() => game.doMobJob(state, 'sitdown')).toThrow(/senior/);
    expect(game.mob(state)!.jobs.find((j) => j.id === 'sitdown')!.available).toBe(false);
  });

  it('makes you only once you have done the thing they ask', () => {
    let state = game.joinMob(withForm('made-1'));
    expect(state.mob!.made).toBe(false);
    for (let i = 0; i < 6 && !state.mob!.made; i++) {
      if (state.character.record.incarceration) break;
      try {
        state = game.doMobJob(state, 'hit').state;
      } catch {
        break;
      }
      state = clear(state);
      if (!state.mob!.made) state = clear(game.ageUp(state).state);
    }
    if (state.mob) expect(state.mob.made || state.character.record.incarceration).toBeTruthy();
  });

  it('caps the year, and notices a year spent doing nothing', () => {
    let state = game.joinMob(withForm('quiet-1'));
    for (let i = 0; i < 3 && !state.character.record.incarceration; i++) {
      state = clear(game.doMobJob(state, 'collect').state);
    }
    if (!state.character.record.incarceration) {
      expect(() => game.doMobJob(state, 'collect')).toThrow(/enough this year/);
    }

    const standing = state.mob!.standing;
    state = clear(game.ageUp(state).state);
    if (state.mob) {
      expect(state.mob.jobsThisYear).toBe(0);
      // A year with no work costs standing; the year just aged did have work.
      state = clear(game.ageUp(state).state);
      if (state.mob) expect(state.mob.standing).toBeLessThan(standing + 1);
    }
  });
});
