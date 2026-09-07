import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

const settle = (state: LifeState): LifeState => {
  while (state.activeEvent) {
    state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
  }
  return game.dismiss(state);
};

/**
 * Getting ill used to be a number quietly falling: a condition appeared between
 * one year and the next, drained health for ever, and there was nothing to
 * decide and nothing to pay. See docs/BITLIFE-LOOP-SPEC.md §5.
 */
describe('being ill is a decision about money', () => {
  const findSymptom = (seeds: number): LifeState | null => {
    for (let i = 0; i < seeds; i++) {
      let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: `sx-${i}` });
      while (state.character.alive && state.character.age < 75) {
        if (state.activeEvent) {
          if (state.activeEvent.definitionId === 'health_symptom') return state;
          state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
          state = game.dismiss(state);
          continue;
        }
        state = game.ageUp(state).state;
      }
    }
    return null;
  };

  it('offers a price list rather than a diagnosis', () => {
    const state = findSymptom(8);
    expect(state, 'no life produced a symptom in 8 seeds').not.toBeNull();
    const popup = state!.activeEvent!;

    expect(popup.stake?.label).toBe('Your concern');
    expect(popup.choices).toHaveLength(4);

    // Free, cheap, and two doctors — the expensive one visibly better.
    const [ignore, counter, cheap, good] = popup.choices;
    expect(ignore!.price).toBeUndefined();
    expect(counter!.price).toBeTruthy();
    expect(cheap!.quality).toBeDefined();
    expect(good!.quality).toBeGreaterThan(cheap!.quality!);
    expect(good!.label).toMatch(/^See Dr\./);
  });

  it('charges for the visit and can still fail', () => {
    const state = findSymptom(8)!;
    const popup = state.activeEvent!;
    const before = state.character.finances.cash + state.character.finances.savings;

    const after = game.choose(state, popup.id, popup.choices[3]!.id);
    const spent = before - (after.character.finances.cash + after.character.finances.savings);

    expect(after.resolvedEvent!.outcomeTitle).toMatch(/Treated|No better|Turned away/);
    // Turned away is the one branch that costs nothing, because nothing happened.
    if (after.resolvedEvent!.outcomeTitle !== 'Turned away') expect(spent).toBeGreaterThan(0);
  });

  it('never says "the a back that never came right"', () => {
    for (let i = 0; i < 8; i++) {
      const state = findSymptom(8);
      if (!state) break;
      const popup = state.activeEvent!;
      const after = game.choose(state, popup.id, popup.choices[i % 4]!.id);
      expect(after.resolvedEvent!.outcomeText).not.toMatch(/\bthe an? /);
    }
  });
});

/**
 * Relationships only ever started by an event firing at you, so a player who
 * wanted one could do nothing but age up and hope.
 */
describe('you can go and meet somebody', () => {
  const single = (): LifeState => {
    for (let seed = 0; seed < 25; seed++) {
      let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: `lv-${seed}` });
      while (state.character.alive && state.character.age < 24) {
        if (state.activeEvent) {
          state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
          continue;
        }
        state = game.ageUp(state).state;
      }
      state = settle(state);
      const attached = state.relationships.some((r) => r.kind === 'partner' || r.kind === 'spouse');
      if (state.character.alive && !attached && !state.character.record.incarceration) return state;
    }
    throw new Error('no seed produced a free, single 24-year-old');
  };

  it('introduces a stranger as a card you can judge', () => {
    const state = game.act(single(), 'find_a_date').state;
    const popup = state.activeEvent;
    expect(popup, 'looking should raise a candidate').not.toBeNull();

    expect(popup!.card.who?.name).toBeTruthy();
    expect(popup!.facts.map((f) => f.label)).toEqual(['Name', 'Age', 'Occupation', 'Lives in']);
    expect(popup!.meters.map((m) => m.label)).toEqual(['Looks', 'Smarts', 'Money', 'Craziness']);
    expect(popup!.choices).toHaveLength(2);
  });

  it('writes one line about it, not two', () => {
    const state = game.act(single(), 'find_a_date').state;
    const popup = state.activeEvent!;
    /*
     * The activity that opens a popup writes nothing of its own: "Find someone."
     * above "You asked X out and were turned down." is the same beat told twice,
     * the second time badly.
     */
    expect(state.history.some((h) => h.line === 'Find someone.')).toBe(false);

    const after = game.choose(state, popup.id, popup.choices[0]!.id);
    expect(after.resolvedEvent!.outcomeTitle).toMatch(/Let's give it a try|Turned down/);
  });

  it('will not let you go looking while you are seeing somebody', () => {
    let state = single();
    // Take the yes, whichever way the roll goes, then try again.
    for (let i = 0; i < 12; i++) {
      const acted = game.act(state, 'find_a_date').state;
      const popup = acted.activeEvent;
      if (!popup) break;
      state = game.dismiss(game.choose(acted, popup.id, popup.choices[0]!.id));
      if (state.relationships.some((r) => r.kind === 'partner')) break;
      state.activityUsage.find_a_date = 0;
    }
    if (!state.relationships.some((r) => r.kind === 'partner')) return;

    const row = game.actions(state).find((a) => a.id === 'find_a_date')!;
    expect(row.available).toBe(false);
    expect(row.blockedReason).toBe('You are seeing someone');
    // And the server refuses it too, rather than trusting the greyed-out row.
    expect(() => game.act(state, 'find_a_date')).toThrow();
  });
});
