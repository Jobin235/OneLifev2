import { describe, expect, it } from 'vitest';
import { InteractionRejected, warmthOf } from '../interact.js';
import { createGame } from '../node.js';

/**
 * The NPC model was always deeper than a single relationship bar; these assert
 * that the depth is actually reachable and that it actually matters.
 */
describe('doing something to a specific person', () => {
  const game = createGame();

  const adultWithPeople = (seed: string) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < 26) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    // Leave no decision open: an open one blocks every interaction, which is
    // correct behaviour but not what these tests are about.
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return state;
  };

  it('offers something to do with everyone you know', () => {
    const state = adultWithPeople('int-1');
    expect(state.relationships.length).toBeGreaterThan(0);
    for (const rel of state.relationships) {
      expect(game.interactions(state, rel.npcId).length).toBeGreaterThan(0);
    }
  });

  it('writes what happened into that person\'s memory', () => {
    const state = adultWithPeople('int-2');
    const rel = state.relationships[0]!;
    const before = rel.memories.length;

    const { state: after, line } = game.interact(state, rel.npcId, 'talk');
    const relAfter = after.relationships.find((r) => r.npcId === rel.npcId)!;

    expect(relAfter.memories.length).toBe(before + 1);
    expect(relAfter.memories.at(-1)!.line).toBe(line);
    // The memory names the person rather than leaving a token behind.
    expect(line).not.toContain('{them}');
  });

  it('lands differently depending on how the relationship already stands', () => {
    const state = adultWithPeople('int-3');
    const rel = state.relationships[0]!;

    // Two versions of the same person: one trusted, one not.
    const warmState = structuredClone(state);
    const warmRel = warmState.relationships.find((r) => r.npcId === rel.npcId)!;
    Object.assign(warmRel.dimensions, {
      affection: 95, trust: 95, closeness: 95, respect: 95, conflict: 0,
    });

    const coldState = structuredClone(state);
    const coldRel = coldState.relationships.find((r) => r.npcId === rel.npcId)!;
    Object.assign(coldRel.dimensions, {
      affection: 5, trust: 5, closeness: 5, respect: 5, conflict: 80,
    });

    expect(warmthOf(warmRel)).toBeGreaterThan(warmthOf(coldRel) + 50);

    // Across many draws the warm relationship should go well far more often.
    const goesWell = (base: typeof state) => {
      let warm = 0;
      for (let i = 0; i < 40; i++) {
        const attempt = structuredClone(base);
        attempt.seed = `${base.seed}:${i}`;
        if (game.interact(attempt, rel.npcId, 'talk').warm) warm++;
      }
      return warm;
    };

    expect(goesWell(warmState)).toBeGreaterThan(goesWell(coldState));
  });

  it('refuses what the relationship has not earned', () => {
    const state = adultWithPeople('int-4');
    const rel = state.relationships[0]!;
    Object.assign(rel.dimensions, {
      affection: 2, trust: 2, closeness: 2, respect: 2, conflict: 90,
    });

    // Confiding needs warmth of 45; this relationship is nowhere near it.
    expect(() => game.interact(state, rel.npcId, 'confide')).toThrow(InteractionRejected);
    const card = game.interactions(state, rel.npcId).find((i) => i.id === 'confide')!;
    expect(card.available).toBe(false);
    expect(card.blockedReason).toBe('You are not close enough for that');
  });

  it('only offers what makes sense for the relationship', () => {
    const state = adultWithPeople('int-5');
    const parent = state.relationships.find((r) => r.kind === 'mother' || r.kind === 'father');
    if (!parent) return;

    const ids = game.interactions(state, parent.npcId).map((i) => i.id);
    // You cannot ask out or disown a parent.
    expect(ids).not.toContain('ask_out');
    expect(ids).not.toContain('cut_off');
    expect(ids).toContain('talk');
  });

  it('limits each interaction per year, per person', () => {
    const state = adultWithPeople('int-6');
    const rel = state.relationships[0]!;

    let current = state;
    for (let i = 0; i < 3; i++) current = game.interact(current, rel.npcId, 'talk').state;
    expect(() => game.interact(current, rel.npcId, 'talk')).toThrow(/Not again this year/);

    // A different person is unaffected — the limit is per relationship.
    const other = current.relationships.find((r) => r.npcId !== rel.npcId);
    if (other) expect(() => game.interact(current, other.npcId, 'talk')).not.toThrow();
  });
});
