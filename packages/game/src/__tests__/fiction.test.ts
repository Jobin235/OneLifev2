import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { peopleView } from '../views.js';

/**
 * Bugs in the fiction, not the code.
 *
 * A person labelled "Brother" with a girl's face, or two siblings with the same
 * first name, is a defect the player notices immediately even though nothing
 * throws. These guard the things that make the world feel written rather than
 * generated.
 */

const game = createGame();

/** "{friend}" leaking into a card is the most visible content bug there is. */
const TOKEN = /\{[a-zA-Z0-9_.]+\}/;

/** "{friend}" leaking into a card is the most visible content bug there is. */

const liveFor = (seed: string, years: number) => {
  let state = game.newLife({ seed, countryId: 'us', cityId: 'portland', upbringing: 'getting_by' });
  for (let i = 0; i < years && state.character.alive; i++) {
    state = game.ageUp(state).state;
    if (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
  }
  return state;
};

const FEMALE_FACES = new Set(['👩', '👧', '👵', '👩‍🦰', '👩‍💼', '👩‍🏫', '👩‍🔬', '👩‍🦱', '👩‍⚕️', '👩‍🎓']);
const MALE_FACES = new Set(['👨', '👦', '👴', '🧔', '👨‍💼', '👨‍🏫', '👨‍🦰', '👨‍⚕️', '👨‍🎓']);

describe('people read as people', () => {
  it('never gives someone a face that contradicts how they are described', () => {
    for (let i = 0; i < 25; i++) {
      const state = liveFor(`face-${i}`, 30);
      for (const npc of state.npcs) {
        if (npc.sex === 'female') {
          expect(MALE_FACES.has(npc.avatarEmoji), `${npc.firstName} (female) has ${npc.avatarEmoji}`).toBe(false);
        } else {
          expect(FEMALE_FACES.has(npc.avatarEmoji), `${npc.firstName} (male) has ${npc.avatarEmoji}`).toBe(false);
        }
      }
    }
  });

  it('does not put two people with the same first name in one family', () => {
    for (let i = 0; i < 25; i++) {
      const state = liveFor(`names-${i}`, 1);
      const family = state.relationships
        .filter((r) => ['mother', 'father', 'sibling'].includes(r.kind))
        .map((r) => state.npcs.find((n) => n.id === r.npcId)!.firstName);

      const unique = new Set([...family, state.character.firstName]);
      expect(unique.size, `duplicate name among ${[...family].join(', ')}`).toBe(family.length + 1);
    }
  });

  it('never shows the player an unresolved content token', () => {
    for (let i = 0; i < 30; i++) {
      let state = game.newLife({
        seed: `token-${i}`,
        countryId: 'us',
        cityId: 'portland',
        upbringing: 'getting_by',
      });
      while (state.character.alive && state.character.age < 90) {
        state = game.ageUp(state).state;
        const event = state.activeEvent;
        if (!event) continue;

        expect(event.title, event.definitionId).not.toMatch(TOKEN);
        expect(event.body, event.definitionId).not.toMatch(TOKEN);
        expect(event.card.label, event.definitionId).not.toMatch(TOKEN);
        for (const choice of event.choices) {
          expect(choice.label, event.definitionId).not.toMatch(TOKEN);
        }

        state = game.choose(state, event.id, event.choices[i % event.choices.length]!.id);
        expect(state.resolvedEvent!.outcomeText!, event.definitionId).not.toMatch(TOKEN);
        expect(state.resolvedEvent!.historyLine!, event.definitionId).not.toMatch(TOKEN);
      }
      for (const entry of state.history) {
        expect(entry.line).not.toMatch(TOKEN);
      }
    }
  });

  it('describes relationships with a fact, not a category', () => {
    const state = liveFor('subtitle', 34);
    const people = peopleView(state);
    for (const row of [...people.close, ...people.around]) {
      expect(row.subtitle.length).toBeGreaterThan(2);
      expect(row.subtitle).not.toMatch(TOKEN);
    }
  });
});
