import { describe, expect, it } from 'vitest';
import { allRibbons, ribbonFor } from '../ribbons.js';
import { createGame } from '../node.js';

/**
 * The ribbon is the replay driver: a life is not just over, it is *a kind of
 * life*, and the next one is an attempt at a different kind. It has to be
 * earned by how the life was actually played.
 */
describe('ribbons', () => {
  const game = createGame();

  const liveOut = (seed: string) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    return state;
  };

  it('gives every finished life exactly one', () => {
    for (let i = 0; i < 12; i++) {
      const state = liveOut(`ribbon-${i}`);
      expect(state.legacy).not.toBeNull();
      const ribbon = state.legacy!.ribbon;
      expect(ribbon.label.length).toBeGreaterThan(0);
      expect(allRibbons().some((r) => r.id === ribbon.id)).toBe(true);
    }
  });

  it('names the unusual thing rather than the ordinary one', () => {
    const state = liveOut('ribbon-rich');

    // A life that ends rich is "Loaded" even if it was also perfectly steady.
    // Money is in cents, so this is five million dollars.
    state.character.finances.savings = 5_000_000_00;
    state.character.finances.debt = 0;
    state.character.finances.cash = 0;
    expect(ribbonFor(state).id).toBe('loaded');

    // Convictions outrank money: what stands out about that life is the record.
    state.character.record.convictions = [
      { id: 'a', offence: 'Burglary', atAge: 30, sentenceYears: 3, fine: 0, spent: false },
      { id: 'b', offence: 'Burglary', atAge: 34, sentenceYears: 4, fine: 0, spent: false },
    ];
    expect(ribbonFor(state).id).toBe('crooked');
  });

  it('remembers what the family line has collected', () => {
    const state = liveOut('ribbon-line');
    expect(state.ribbonsEarned.length).toBeGreaterThan(0);
    expect(state.ribbonsEarned).toContain(state.legacy!.ribbon.id);

    // Carrying on as an heir keeps the collection.
    const heir = state.legacy!.heirs[0];
    if (heir) {
      const next = game.succeed(state, heir.npcId, 'ribbon-line-2');
      expect(next.ribbonsEarned).toEqual(expect.arrayContaining(state.ribbonsEarned));
    }
  });

  it('produces more than one kind of verdict across many lives', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) seen.add(liveOut(`variety-${i}`).legacy!.ribbon.id);
    // If every life earned the same ribbon it would say nothing.
    expect(seen.size).toBeGreaterThan(2);
  });
});
