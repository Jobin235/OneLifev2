import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';

/**
 * A life should feel lived-in. These assert density and variety, because the
 * failure mode they guard against — a log with one line every other year — is
 * not a crash and no other test would notice it.
 */
describe('a year has texture', () => {
  const game = createGame();

  const liveTo = (seed: string, until: number) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < until) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    return state;
  };

  it('fills most years with something', () => {
    const state = liveTo('texture-1', 40);
    const years = new Set(state.history.map((e) => e.atAge));
    const lived = state.character.age;

    // BitLife rarely gives you a silent year; neither should we.
    expect(years.size / lived).toBeGreaterThan(0.9);
    expect(state.history.length / lived).toBeGreaterThan(2);
  });

  it('never repeats a line close enough to notice', () => {
    const state = liveTo('texture-2', 70);

    /*
     * This is the repetition that reads as a bug. The same observation at 25 and
     * at 55 is a life having patterns; the same one at 25 and 27 is the content
     * pool running dry. Cooldowns are supposed to make the second impossible, so
     * assert it directly rather than via a global uniqueness ratio.
     */
    const lastSeen = new Map<string, number>();
    for (const entry of state.history) {
      const previous = lastSeen.get(entry.line);
      if (previous !== undefined) {
        expect(
          entry.atAge - previous,
          `"${entry.line}" repeated at ${previous} and ${entry.atAge}`,
        ).toBeGreaterThanOrEqual(5);
      }
      lastSeen.set(entry.line, entry.atAge);
    }
  });

  it('draws widely enough that a long life does not feel written from a short list', () => {
    const state = liveTo('texture-2b', 60);
    const lines = state.history.map((e) => e.line);

    // A softer companion to the cooldown check above: this is the number that
    // collapsed to 0.62 when the pool was too thin, so it guards the catalogue's
    // size rather than any single line's behaviour.
    expect(new Set(lines).size / lines.length).toBeGreaterThan(0.72);
  });

  it('names real people rather than "your friend"', () => {
    const state = liveTo('texture-3', 45);
    for (const entry of state.history) {
      expect(entry.line).not.toMatch(/\{(friend|partner|parent|sibling|child|colleague)\}/);
    }
    // At least some lines should be about someone specific.
    expect(state.history.some((e) => e.npcIds.length > 0)).toBe(true);
  });

  it('keeps lines appropriate to the age they land on', () => {
    const state = liveTo('texture-4', 70);
    const childhoodOnly = state.history.filter((e) => e.line.includes('first word'));
    for (const entry of childhoodOnly) expect(entry.atAge).toBeLessThan(3);

    const retirement = state.history.filter((e) => e.line.startsWith('You filled the mornings'));
    for (const entry of retirement) expect(entry.atAge).toBeGreaterThanOrEqual(60);
  });
});
