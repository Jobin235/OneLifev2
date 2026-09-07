import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { REWIND_YEARS, forget, remember, rewind, rewindOptions, type Snapshot } from '../timemachine.js';
import type { LifeState } from '@lineage/shared-types';

/**
 * The Time Machine. Eight years, the player picks how far, and it works after
 * death — BitLife's rules. The one with teeth is that it does not save anybody.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
describe('the time machine', () => {
  const game = createGame();

  /** Lives a character forward, keeping snapshots the way the storage layer does. */
  const live = (seed: string, until: number) => {
    let state: LifeState = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    let history: Snapshot[] = [];
    while (state.character.alive && state.character.age < until) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      history = remember(history, state);
      state = game.ageUp(state).state;
    }
    return { state, history };
  };

  it('reaches eight years back and no further', () => {
    const { state, history } = live('tm-1', 40);
    const options = rewindOptions(history, state);

    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(REWIND_YEARS);
    for (const option of options) {
      expect(state.character.age - option.atAge).toBeLessThanOrEqual(REWIND_YEARS);
      expect(option.atAge).toBeLessThan(state.character.age);
    }
    // Newest first, and each one says what it costs.
    expect(options[0]!.atAge).toBeGreaterThan(options[options.length - 1]!.atAge);
    expect(options[0]!.note).toMatch(/Undoes \d+ years?/);
  });

  it('un-lives the years, including what they did to you', () => {
    const { state, history } = live('tm-2', 45);
    const target = rewindOptions(history, state).at(-1)!;
    const linesBefore = state.history.length;

    const back = rewind(history, state, target.atAge);

    expect(back.character.age).toBe(target.atAge);
    expect(back.history.length).toBeLessThan(linesBefore);
    // Nothing from the undone years is still in the log.
    expect(back.history.every((entry) => entry.atAge <= target.atAge)).toBe(true);
  });

  it('records every death it sees, so a rewind cannot unsee it', () => {
    let deaths = 0;
    for (let i = 0; i < 6; i++) {
      const { state } = live(`tm-ledger-${i}`, 70);
      for (const npc of state.npcs) {
        if (npc.alive) continue;
        const fate = state.fated.find((f) => f.npcId === npc.id);
        expect(fate, `${npc.firstName} died with no fate recorded`).toBeDefined();
        expect(fate!.cause.length).toBeGreaterThan(0);
        deaths += 1;
      }
    }
    expect(deaths).toBeGreaterThan(0);
  });

  it('does not bring anybody back', () => {
    /*
     * The rule that stops this being a cheat code for grief. Set up rather than
     * hunted for: real deaths are rare enough that finding one inside an
     * eight-year window takes dozens of seeds, and a test that searches for its
     * own preconditions is a test that quietly stops running.
     */
    const { state, history } = live('tm-dead', 50);
    const victim = state.npcs.find((n) => n.alive && n.age > 20)!;
    expect(victim).toBeDefined();

    // As if this life had already watched them go, two years from now.
    const diesAt = state.character.age + 2;
    state.fated.push({ npcId: victim.id, atAge: diesAt, cause: 'of a heart attack' });

    const past = rewindOptions(history, state).at(-1)!;
    let back = rewind(history, state, past.atAge);

    // Alive again, and the knowledge came with you.
    expect(back.npcs.find((n) => n.id === victim.id)?.alive).toBe(true);
    expect(back.fated.some((f) => f.npcId === victim.id)).toBe(true);

    while (back.character.alive && back.character.age <= diesAt) {
      if (back.activeEvent) {
        back = game.choose(back, back.activeEvent.id, back.activeEvent.choices[0]!.id);
        continue;
      }
      back = game.ageUp(back).state;
    }

    // And then they go the same way, on time.
    const after = back.npcs.find((n) => n.id === victim.id)!;
    expect(after.alive).toBe(false);
    expect(back.history.some((h) => /died of a heart attack/.test(h.line))).toBe(true);
  });

  it('works after the character is dead', () => {
    let state: LifeState = game.newLife({ countryId: 'us', upbringing: 'rough', seed: 'tm-end' });
    let history: Snapshot[] = [];
    while (state.character.alive) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      history = remember(history, state);
      state = game.ageUp(state).state;
    }
    expect(state.character.alive).toBe(false);

    const options = rewindOptions(history, state);
    expect(options.length).toBeGreaterThan(0);
    const back = rewind(history, state, options[0]!.atAge);
    expect(back.character.alive).toBe(true);
  });

  it('refuses a year it cannot reach', () => {
    const { state, history } = live('tm-3', 40);
    expect(() => rewind(history, state, state.character.age)).toThrow();
    expect(() => rewind(history, state, state.character.age + 1)).toThrow();
    expect(() => rewind(history, state, 2)).toThrow();
  });

  it('drops the years it undid, so they cannot be reached again', () => {
    const { state, history } = live('tm-4', 40);
    const target = rewindOptions(history, state).at(-1)!;
    const pruned = forget(history, target.atAge);
    expect(pruned.every((s) => s.atAge <= target.atAge)).toBe(true);
    expect(pruned.length).toBeLessThan(history.length);
  });
});
