import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import type { LifeState } from '@lineage/shared-types';

/**
 * The world moves without you.
 *
 * This is what separates a life from a stat sheet: most of what a player reads
 * in a given year happened to somebody else. These tests guard the failure mode
 * that produced the player's complaint — a log about one person, in which jobs
 * and children and money appear from nowhere with nobody attached to them.
 * See docs/BITLIFE-LOOP-SPEC.md §4.
 */
describe('the world moves without you', () => {
  const game = createGame();

  const liveTo = (seed: string, until: number): LifeState => {
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

  it('writes a good share of every life about other people', () => {
    let aboutOthers = 0;
    let total = 0;
    for (let i = 0; i < 6; i++) {
      const state = liveTo(`world-${i}`, 55);
      total += state.history.length;
      aboutOthers += state.history.filter((entry) => /^Your |unfriended you/.test(entry.line)).length;
    }
    // A life in which nothing happens to anybody else is the bug this catches.
    expect(aboutOthers / total).toBeGreaterThan(0.1);
  });

  it('names the person and what they are to you, every time', () => {
    const state = liveTo('world-names', 55);
    const family = state.history.filter((entry) => entry.line.startsWith('Your '));
    expect(family.length).toBeGreaterThan(8);

    /*
     * "Your sibling" and "Your child" are the labels, not how anybody speaks.
     * The log has to say big sister, little brother, daughter, nephew — the
     * relation the player would use out loud.
     */
    for (const entry of family) {
      expect(entry.line).not.toMatch(/^Your (sibling|child|niece_nephew)\b/);
    }
  });

  it('closes the threads it opens', () => {
    /*
     * Diagnosed one year, recovered another; married before the baby. A game
     * that only ever writes the first half of these is writing flavour, not
     * consequences.
     */
    let diagnoses = 0;
    let recoveries = 0;
    let marriages = 0;
    let births = 0;
    for (let i = 0; i < 8; i++) {
      const state = liveTo(`world-thread-${i}`, 60);
      for (const entry of state.history) {
        if (/has been diagnosed with/.test(entry.line)) diagnoses += 1;
        if (/is no longer suffering from/.test(entry.line)) recoveries += 1;
        if (/ married /.test(entry.line)) marriages += 1;
        if (/had a baby (boy|girl) named/.test(entry.line)) births += 1;
      }
    }
    expect(diagnoses).toBeGreaterThan(10);
    expect(recoveries).toBeGreaterThan(3);
    expect(marriages).toBeGreaterThan(2);
    expect(births).toBeGreaterThan(0);
  });

  it('never tells you about somebody who is dead', () => {
    for (let i = 0; i < 4; i++) {
      const state = liveTo(`world-dead-${i}`, 70);
      const deadAt = new Map<string, number>();
      for (const entry of state.history) {
        const match = /^Your ([a-z ]+?), ([A-Z][a-z]+), died|^Your ([a-z ]+) died/.exec(entry.line);
        if (match) deadAt.set(entry.line, entry.atAge);
      }
      // The engine's own guarantee: nobody who is dead is still in a living
      // relationship producing news.
      for (const npc of state.npcs) {
        if (npc.alive) continue;
        const later = state.history.filter(
          (entry) => entry.npcIds.includes(npc.id) && entry.atAge > (npc.age ?? 0) + 200,
        );
        expect(later).toHaveLength(0);
      }
    }
  });

  it('does not let one year turn into a wall of text', () => {
    for (let i = 0; i < 5; i++) {
      const state = liveTo(`world-density-${i}`, 70);
      const perYear = new Map<number, number>();
      for (const entry of state.history) {
        perYear.set(entry.atAge, (perYear.get(entry.atAge) ?? 0) + 1);
      }
      const counts = [...perYear.values()];
      const average = counts.reduce((a, b) => a + b, 0) / counts.length;

      // BitLife runs three to eight lines a year. Ours has to sit in that band:
      // fewer and a year feels empty, more and the log stops being readable.
      expect(average).toBeGreaterThan(2.5);
      expect(average).toBeLessThan(7);
      expect(Math.max(...counts)).toBeLessThanOrEqual(12);
    }
  });

  it('gives a life more people than it started with', () => {
    const start = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: 'world-grow' });
    const born = start.npcs.length;
    const state = liveTo('world-grow', 60);
    expect(state.npcs.length).toBeGreaterThan(born + 6);
  });
});
