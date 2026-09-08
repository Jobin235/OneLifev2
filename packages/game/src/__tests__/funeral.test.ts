import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * A death is a fact. A funeral is a decision.
 *
 * The largest thing that can happen to a person used to be one line the log
 * scrolled past at the same weight as a promotion at work: the player was told,
 * and never asked. These hold the shape of the decision that replaced it — in
 * particular that there is no free answer, and that the cheapest one today is
 * the expensive one afterwards.
 */
const run = (seed: string, answer: 'speak' | 'attend' | 'stay') => {
  let state: LifeState = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
  const funerals: { before: LifeState; after: LifeState }[] = [];

  while (state.character.alive && state.character.age < 85) {
    while (state.activeEvent) {
      if (state.activeEvent.definitionId === 'family_funeral') {
        const before = structuredClone(state);
        state = game.choose(state, state.activeEvent.id, answer);
        funerals.push({ before, after: structuredClone(state) });
        continue;
      }
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);
    state = game.ageUp(state).state;
  }
  return { state, funerals };
};

describe('a funeral is a decision', () => {
  it('stops the year when somebody close dies, and says who', () => {
    let seen = 0;
    for (let i = 0; i < 12 && seen < 3; i++) {
      const { funerals } = run(`fun-shape-${i}`, 'attend');
      for (const { before } of funerals) {
        const card = before.activeEvent!;
        expect(card.choices).toHaveLength(3);
        // Named in the title, described in the body: never "somebody died".
        expect(card.title).toMatch(/\S+ \S+ is gone\./);
        expect(card.body).toMatch(/died/);
        expect(card.body).not.toMatch(/\{|\}/);
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(2);
  });

  it('still writes the death itself, whatever the player answers', () => {
    const { state } = run('fun-line-1', 'stay');
    const deaths = state.history.filter((h) => / died /.test(h.line));
    expect(deaths.length).toBeGreaterThan(0);
  });

  it('charges grief to everybody, and standing only to the ones who stayed home', () => {
    /*
     * The point of the decision. Going costs more happiness on the day; not
     * going costs the people who are still alive, which is the bill that
     * arrives later and is the one worth being afraid of.
     */
    let wentDown = 0;
    let stayedDown = 0;
    let griefWent = 0;
    let griefStayed = 0;

    for (let i = 0; i < 10; i++) {
      for (const answer of ['speak', 'stay'] as const) {
        const { funerals } = run(`fun-cost-${i}`, answer);
        for (const { before, after } of funerals) {
          const grief = after.character.stats.happiness - before.character.stats.happiness;
          const family = (s: LifeState) =>
            s.relationships
              .filter((r) => ['mother', 'father', 'sibling', 'child', 'spouse'].includes(r.kind))
              .reduce((sum, r) => sum + r.dimensions.affection, 0);
          const standing = family(after) - family(before);

          if (answer === 'speak') {
            griefWent += grief;
            if (standing > 0) wentDown += 1;
          } else {
            griefStayed += grief;
            if (standing < 0) stayedDown += 1;
          }
        }
      }
    }

    // Speaking hurts more now than staying home does.
    expect(griefWent).toBeLessThan(griefStayed);
    // And staying home is what the rest of the family registers.
    expect(stayedDown).toBeGreaterThan(0);
    expect(wentDown).toBeGreaterThan(0);
  });

  it('never buries the same person twice', () => {
    const { funerals } = run('fun-once-1', 'attend');
    const buried = funerals.map((f) => String(f.before.flags.funeral_npc));
    expect(new Set(buried).size).toBe(buried.length);
  });
});
