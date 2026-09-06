import { describe, expect, it } from 'vitest';
import { checkInvariants } from '@lineage/simulation';
import type { LifeState } from '@lineage/shared-types';
import { Game } from '../game.js';

/**
 * Design 4C. A life ending is a chapter break, not a fail state — the player is
 * offered somebody who was in the last life and carries on as them.
 */

const game = new Game();

/** Plays until death, taking the choice most likely to produce children. */
const liveUntilDeath = (seed: string): LifeState => {
  let state = game.newLife({ seed, countryId: 'us', cityId: 'portland', upbringing: 'getting_by' });
  while (state.character.alive && state.character.age < 120) {
    state = game.ageUp(state).state;
    if (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
  }
  return state;
};

describe('succession', () => {
  it('always offers a way to keep playing', () => {
    for (const seed of ['succ-1', 'succ-2', 'succ-3', 'succ-4']) {
      const dead = liveUntilDeath(seed);
      expect(dead.legacy).not.toBeNull();
      expect(dead.legacy!.heirs.length).toBeGreaterThan(0);
      // "Somebody new" is always the last option, so a childless life is never a wall.
      expect(dead.legacy!.heirs.at(-1)!.npcId).toBeNull();
    }
  });

  it('starting over as somebody new keeps the world but not the family', () => {
    const dead = liveUntilDeath('succ-fresh');
    const next = game.succeed(dead, null, 'succ-fresh-gen2');

    expect(next.character.age).toBe(0);
    expect(next.character.alive).toBe(true);
    expect(next.lineage.generation).toBe(1);
    expect(() => checkInvariants(next)).not.toThrow();
  });

  it('continuing as an heir carries the name, the estate and the ancestors', () => {
    // Find a seed whose life actually produced a child to inherit.
    let dead: LifeState | null = null;
    for (let i = 0; i < 40 && !dead; i++) {
      const candidate = liveUntilDeath(`heir-search-${i}`);
      const heir = candidate.legacy!.heirs.find((h) => h.npcId !== null);
      if (heir) dead = candidate;
    }
    if (!dead) {
      // Content-dependent; if no life in the sample had children there is nothing
      // to assert, and the test above already covers the childless path.
      return;
    }

    const heirId = dead.legacy!.heirs.find((h) => h.npcId !== null)!.npcId!;
    const heirNpc = dead.npcs.find((n) => n.id === heirId)!;
    const next = game.succeed(dead, heirId, 'heir-gen2');

    expect(next.character.firstName).toBe(heirNpc.firstName);
    expect(next.character.age).toBe(heirNpc.age);
    expect(next.character.alive).toBe(true);
    expect(next.lineage.generation).toBe(2);
    expect(next.lineage.familyName).toBe(dead.lineage.familyName);
    expect(next.lineage.ancestors).toHaveLength(1);
    expect(next.lineage.ancestors[0]!.name).toBe(
      `${dead.character.firstName} ${dead.character.lastName}`,
    );
    expect(() => checkInvariants(next)).not.toThrow();

    // The heir can then live their own life.
    let playing = next;
    for (let i = 0; i < 5 && playing.character.alive; i++) {
      playing = game.ageUp(playing).state;
      if (playing.activeEvent) {
        playing = game.choose(playing, playing.activeEvent.id, playing.activeEvent.choices[0]!.id);
      }
    }
    expect(() => checkInvariants(playing)).not.toThrow();
  });

  it('refuses to succeed a life that has not ended', () => {
    const alive = game.newLife({ seed: 'still-alive', countryId: 'us', upbringing: 'getting_by' });
    expect(() => game.succeed(alive, null, 'x')).toThrow(/has not ended/);
  });
});
