import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { FAMOUS_AT } from '../fame.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * Fame.
 *
 * The three-way opinion model existed for a long time with nothing feeding it,
 * so every character died unknown. These tests are mostly about the two things
 * that feed it now — an account you keep up, and rooms you get let into — and
 * about the forgetting, which is the part that makes the rest mean anything.
 */
describe('being known', () => {
  /** An adult, out of school, out of jail, with the year cleared. */
  const adult = (seed: string, toAge = 22): LifeState => {
    let state = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed });
    while (state.character.alive && state.character.age < toAge) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);
    state.character.record.incarceration = null;
    return state;
  };

  it('starts everybody unknown', () => {
    /*
     * A life that has not gone looking for it. Twenty-two years of ordinary
     * events can hand somebody a few thousand followers by accident, which is
     * correct — but it is not what this is measuring.
     */
    const state = adult('unknown-1');
    state.character.fame = { ...state.character.fame, following: 0, fans: 0, haters: 0, indifferent: 100 };
    const view = game.fame(state);
    expect(view.following).toBe(0);
    expect(view.line).toBe('Nobody knows who you are.');
    expect(view.famous).toBe(false);
  });

  it('grows an account for posting, and rewards keeping it up', () => {
    let state = adult('poster-1');
    state.character.stats.charm = 80;
    state.character.stats.fitness = 70;

    const followers: number[] = [];
    for (let year = 0; year < 6 && state.character.alive; year++) {
      // An account is not the thing being tested; a cell would stop it, and a
      // life that runs six years can pick one up on the way.
      state.character.record.incarceration = null;
      state = game.act(state, 'post_online').state;
      followers.push(state.character.fame.following);
      while (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
      state = game.dismiss(state);
      state = game.ageUp(state).state;
      while (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
      state = game.dismiss(state);
    }

    // Every year adds somebody, and the run is what the screen shows.
    expect(followers[0]).toBeGreaterThan(0);
    expect(followers.at(-1)!).toBeGreaterThan(followers[0]!);
    expect(game.fame(state).posting.streak).toBeGreaterThanOrEqual(5);
  });

  it('forgets you when you stop', () => {
    let state = adult('forgotten-1');
    state.character.stats.charm = 80;
    state = game.act(state, 'post_online').state;
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);
    const peak = state.character.fame.following;
    expect(peak).toBeGreaterThan(0);

    // Two quiet years: nobody stays famous for nothing.
    for (let i = 0; i < 3; i++) {
      state = game.ageUp(state).state;
      while (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
      }
      state = game.dismiss(state);
    }
    expect(state.character.fame.following).toBeLessThan(peak);
    expect(game.fame(state).posting.streak).toBe(0);
  });

  it('will not let a child open an account', () => {
    let state = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed: 'child-1' });
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);
    expect(state.character.age).toBeLessThan(13);
    expect(() => game.act(state, 'post_online')).toThrow();
    expect(game.fame(state).posting.available).toBe(false);
  });

  it('keeps the tracks you audition for out of the ordinary job listing', () => {
    const state = adult('listing-1');
    const listed = game.openings(state).map((o) => o.trackId);
    expect(listed).not.toContain('acting');
    expect(listed).not.toContain('modelling');
    expect(game.fame(state).auditions.map((a) => a.trackId)).toContain('acting');
  });

  it('raises an audition rather than deciding anything, and caps the year', () => {
    let state = adult('audition-1');
    state.character.stats.charm = 90;
    state.character.stats.fitness = 80;

    state = game.audition(state, 'acting');
    expect(state.activeEvent).not.toBeNull();
    expect(state.activeEvent!.definitionId).toBe('audition');
    // The odds are on the button, not hidden in the prose.
    const safe = state.activeEvent!.choices.find((c) => c.id === 'safe')!;
    expect(safe.quality).toBeGreaterThan(0);

    state = game.choose(state, state.activeEvent!.id, 'safe');
    state = game.dismiss(state);

    expect(game.fame(state).auditionsLeft).toBe(2);
    state = game.audition(state, 'music');
    state = game.choose(state, state.activeEvent!.id, 'leave');
    state = game.dismiss(state);
    state = game.audition(state, 'modelling');
    state = game.choose(state, state.activeEvent!.id, 'leave');
    state = game.dismiss(state);

    expect(game.fame(state).auditionsLeft).toBe(0);
    expect(() => game.audition(state, 'acting')).toThrow(/enough this year/);
  });

  it('turns you down more often than not, and casts you sometimes', () => {
    let cast = 0;
    let attempts = 0;
    for (let seed = 0; seed < 14; seed++) {
      let state = adult(`casting-${seed}`);
      state.character.stats.charm = 75;
      state.character.stats.fitness = 65;
      for (let go = 0; go < 3; go++) {
        state = game.audition(state, 'acting');
        state = game.choose(state, state.activeEvent!.id, 'safe');
        state = game.dismiss(state);
        attempts += 1;
        if (state.career.current?.trackId === 'acting') {
          cast += 1;
          break;
        }
      }
    }
    expect(cast).toBeGreaterThan(0);
    expect(cast / attempts).toBeLessThan(0.5);
  });

  /** Puts somebody at the top of a ladder, bypassing the climb. */
  const putAtTheTop = (state: LifeState, trackId: string, rungId: string, title: string): void => {
    state.career.current = {
      trackId,
      employerName: 'Vardon Pictures',
      rungId,
      title,
      salary: 9_500_000,
      yearsInRole: 4,
      yearsAtEmployer: 4,
      performance: 80,
      satisfaction: 75,
      rivalNpcId: null,
      managerNpcId: null,
    };
  };

  it('makes a career in front of people famous, and an ordinary one not', () => {
    let star = adult('star-1', 20);
    let clerk = adult('star-1', 20);
    putAtTheTop(star, 'acting', 'acting_4', 'Movie star');
    putAtTheTop(clerk, 'accounting', 'accounting_3', 'Partner');

    for (let i = 0; i < 11; i++) {
      for (const who of [star, clerk]) {
        if (!who.character.alive) continue;
        const held = { ...who.career.current! };
        const next = game.ageUp(who).state;
        Object.assign(who, next);
        while (who.activeEvent) {
          Object.assign(who, game.choose(who, who.activeEvent.id, who.activeEvent.choices[0]!.id));
        }
        Object.assign(who, game.dismiss(who));
        // The ordinary career churn is not what this is measuring.
        who.career.current = { ...held, yearsInRole: held.yearsInRole + 1 };
      }
    }

    expect(star.character.fame.following).toBeGreaterThan(FAMOUS_AT);
    expect(star.character.fame.knownFor).toBe('acting');
    expect(star.character.fame.reach).not.toBe('none');

    /*
     * A partner at an accountancy firm is not a household name. Not zero — the
     * odd event still puts a person in the local paper — but nowhere near.
     */
    expect(clerk.character.fame.following).toBeLessThan(star.character.fame.following / 20);
    expect(clerk.character.fame.following).toBeLessThan(FAMOUS_AT);
  });
});
