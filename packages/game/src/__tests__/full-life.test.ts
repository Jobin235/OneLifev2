import { describe, expect, it } from 'vitest';
import { checkInvariants, netWorth } from '@lineage/simulation';
import type { LifeState } from '@lineage/shared-types';
import { Game } from '../game.js';
import { lifeView, moneyView, peopleView } from '../views.js';

/**
 * Spec §199, Task 5: "The entire life should run successfully in automated tests.
 * Only then build the UI."
 *
 * These tests are the acceptance criteria for the simulation. They do not assert
 * that a *particular* story happens — that would make the engine untunable — they
 * assert that a life runs from birth to death without breaking, that it produces
 * a story at all, and that replaying it reproduces it exactly.
 */

const game = new Game();

/** Plays a whole life, always taking the choice at `choiceIndex` when asked. */
const playLife = (seed: string, choiceIndex = 0) => {
  let state = game.newLife({ seed, countryId: 'us', cityId: 'portland', upbringing: 'getting_by' });

  let years = 0;
  const decisions: string[] = [];

  while (state.character.alive && years < 130) {
    const result = game.ageUp(state);
    state = result.state;
    years += 1;

    if (state.activeEvent) {
      const choices = state.activeEvent.choices;
      const choice = choices[Math.min(choiceIndex, choices.length - 1)]!;
      decisions.push(`${state.character.age}:${state.activeEvent.definitionId}:${choice.id}`);
      state = game.choose(state, state.activeEvent.id, choice.id);
      state = game.dismiss(state);
    }
  }

  return { state, years, decisions };
};

describe('a whole life', () => {
  it('runs from birth to death without breaking an invariant', () => {
    const { state, years } = playLife('acceptance-seed-1');

    expect(state.character.alive).toBe(false);
    expect(state.character.deathAge).not.toBeNull();
    expect(state.gameState).toBe('LIFE_COMPLETE');
    expect(years).toBeGreaterThan(30);
    expect(years).toBeLessThanOrEqual(123);
    expect(() => checkInvariants(state)).not.toThrow();
  });

  it('produces a life story rather than a list of numbers', () => {
    const { state } = playLife('acceptance-seed-2');

    expect(state.history.length).toBeGreaterThan(15);
    for (const entry of state.history) {
      expect(entry.line.length).toBeGreaterThan(4);
      // Every history line is a sentence, not a stat dump.
      expect(entry.line).not.toMatch(/[+-]\d+\s*(health|happiness|smarts)/i);
    }
  });

  it('ends with a legacy the design can render', () => {
    const { state } = playLife('acceptance-seed-3');
    const legacy = state.legacy;

    expect(legacy).not.toBeNull();
    expect(legacy!.chapters.length).toBeGreaterThan(0);
    expect(legacy!.numbers).toHaveLength(6);
    expect(legacy!.howPeopleSawYou.length).toBeGreaterThan(0);
    expect(legacy!.whatYouChanged.length).toBeGreaterThan(0);
    // Design 4C always offers a way to keep playing.
    expect(legacy!.heirs.length).toBeGreaterThan(0);
    expect(legacy!.heirs.at(-1)!.npcId).toBeNull();
  });

  it('meets people, and keeps them', () => {
    const { state } = playLife('acceptance-seed-4', 0);
    expect(state.npcs.length).toBeGreaterThanOrEqual(2);

    // Anyone who was ever in the life is still addressable at the end of it.
    for (const rel of state.relationships) {
      expect(state.npcs.some((n) => n.id === rel.npcId)).toBe(true);
    }
  });
});

describe('determinism', () => {
  it('replays identically from the same seed and the same choices', () => {
    const a = playLife('replay-seed');
    const b = playLife('replay-seed');

    expect(b.decisions).toEqual(a.decisions);
    expect(b.state.character.deathAge).toBe(a.state.character.deathAge);
    expect(b.state.character.stats).toEqual(a.state.character.stats);
    expect(netWorth(b.state)).toBe(netWorth(a.state));
    expect(b.state.history.map((h) => h.line)).toEqual(a.state.history.map((h) => h.line));
  });

  it('produces different lives from different seeds', () => {
    const a = playLife('seed-alpha');
    const b = playLife('seed-beta');

    const storyA = a.state.history.map((h) => h.line).join('|');
    const storyB = b.state.history.map((h) => h.line).join('|');
    expect(storyA).not.toBe(storyB);
  });

  it('produces different lives from the same seed when choices differ', () => {
    const cautious = playLife('same-seed-different-choices', 0);
    const bold = playLife('same-seed-different-choices', 2);

    expect(bold.decisions).not.toEqual(cautious.decisions);
  });
});

describe('the vertical slice (spec §164)', () => {
  it('can reach education, work, money and people across a life', () => {
    // Several seeds, because any single life is allowed to be uneventful.
    const outcomes = ['slice-1', 'slice-2', 'slice-3', 'slice-4', 'slice-5', 'slice-6'].map((seed) =>
      playLife(seed, 0),
    );

    const reached = {
      employed: outcomes.some((o) => o.state.career.history.length > 0 || o.state.career.current),
      earned: outcomes.some((o) => o.state.character.finances.salary > 0 || netWorth(o.state) !== 0),
      metPeople: outcomes.some((o) => o.state.npcs.length > 3),
      hadChoices: outcomes.some((o) => o.decisions.length >= 3),
      livedDecades: outcomes.some((o) => (o.state.character.deathAge ?? 0) >= 60),
    };

    expect(reached).toEqual({
      employed: true,
      earned: true,
      metPeople: true,
      hadChoices: true,
      livedDecades: true,
    });
  });
});

describe('the views the design renders', () => {
  it('builds a Life screen from any point in a life', () => {
    let state: LifeState = game.newLife({
      seed: 'view-seed',
      countryId: 'us',
      cityId: 'portland',
      upbringing: 'getting_by',
    });
    for (let i = 0; i < 28 && state.character.alive; i++) {
      state = game.ageUp(state).state;
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
    }

    const view = lifeView(state, game.content);
    expect(view.stats).toHaveLength(5);
    expect(view.stats.map((s) => s.key)).toEqual([
      'health',
      'happiness',
      'smarts',
      'fitness',
      'charm',
    ]);
    expect(view.money).toMatch(/^−?\$/);
    expect(view.ageUpLabel).toBeTruthy();

    const people = peopleView(state);
    expect(people.headline).toMatch(/you actually know$/);

    const money = moneyView(state, game.config);
    expect(money.netWorth).toMatch(/^−?\$/);
  });
});
