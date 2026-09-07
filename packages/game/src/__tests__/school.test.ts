import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';

/**
 * School is where the design's continuity bet is made: a classmate met at 15 is
 * the person who turns up again at 24. That only works if school introduces
 * anyone, which for a long time it did not.
 */
describe('school is a place with people in it', () => {
  const game = createGame();

  const liveTo = (seed: string, age: number) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < age) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return state;
  };

  it('introduces classmates and a teacher', () => {
    const state = liveTo('school-1', 13);
    const kinds = state.relationships.map((r) => r.kind);
    expect(kinds).toContain('classmate');
    expect(kinds.some((k) => k === 'teacher' || k === 'friend')).toBe(true);
  });

  it('keeps the people it introduced', () => {
    const atSchool = liveTo('school-2', 13);
    const classmateIds = atSchool.relationships
      .filter((r) => r.kind === 'classmate')
      .map((r) => r.npcId);
    expect(classmateIds.length).toBeGreaterThan(0);

    // Ten years later they are still in the life, whatever they became.
    const later = liveTo('school-2', 24);
    const stillThere = classmateIds.filter((id) => later.npcs.some((n) => n.id === id));
    expect(stillThere.length).toBeGreaterThan(0);
  });

  it('tracks grades and popularity separately', () => {
    const state = liveTo('school-3', 13);
    const school = game.school(state);
    expect(school).not.toBeNull();

    const before = state.education.current!;
    const grades = before.gradePoints;
    const popularity = before.popularity;

    // Studying moves grades and not popularity; socialising does the reverse.
    const studied = game.act(state, 'study').state;
    expect(studied.education.current!.gradePoints).toBeGreaterThan(grades);
    expect(studied.education.current!.popularity).toBe(popularity);

    const social = game.act(studied, 'school_social').state;
    expect(social.education.current!.popularity).toBeGreaterThan(popularity);
  });

  it('makes cheating a risk rather than a discount', () => {
    const state = liveTo('school-4', 14);

    let caught = 0;
    let worked = 0;
    for (let i = 0; i < 60; i++) {
      const attempt = structuredClone(state);
      attempt.seed = `${state.seed}:${i}`;
      const result = game.act(attempt, 'cheat_on_test');
      if (result.outcome === 'backfired') {
        caught++;
        // Caught is strictly worse than never having tried.
        expect(result.state.education.current!.gradePoints).toBeLessThan(
          state.education.current!.gradePoints,
        );
      } else {
        worked++;
        expect(result.state.education.current!.gradePoints).toBeGreaterThan(
          state.education.current!.gradePoints,
        );
      }
    }
    expect(caught).toBeGreaterThan(0);
    expect(worked).toBeGreaterThan(0);
  });

  it('lets a teenager walk away from it', () => {
    const state = liveTo('school-5', 17);
    if (!state.education.current) return;

    const after = game.act(state, 'drop_out').state;
    expect(after.education.current).toBeNull();
    expect(after.education.history.at(-1)!.completed).toBe(false);
  });
});
