import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { livingAdult } from './fixtures.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

const clear = (state: LifeState): LifeState => {
  let s = state;
  while (s.activeEvent) s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
  return game.dismiss(s);
};

const adult = (seed: string, cents = 2_000_000_00): LifeState => {
  const s = livingAdult(game, seed, { toAge: 22, upbringing: 'getting_by' });
  s.character.finances.savings = cents;
  return s;
};

/**
 * Whether tonight can happen at all. A cell stops the second life the same way
 * it stops the first one, and these are tests about the unmasking, not about
 * whatever the day job talked them into.
 */
const free = (state: LifeState): boolean =>
  state.vigilante !== null && state.character.record.incarceration === null;

/** Goes out and answers the incident the given way. */
const night = (state: LifeState, how: string): LifeState => {
  let s = game.goOut(state);
  expect(s.activeEvent).not.toBeNull();
  s = game.choose(s, s.activeEvent!.id, how);
  return game.dismiss(s);
};

/**
 * The other life.
 *
 * Every other system here is one life doing one more thing. This is two, and
 * the number that decides everything is not how many people got home — it is
 * how close the first life is to finding out about the second.
 */
describe('the other life', () => {
  it('is the city that names you', () => {
    const state = game.startVigilante(adult('vig-1'));
    const view = game.vigilante(state);
    expect(view.active).toBe(true);
    expect(view.alias.length).toBeGreaterThan(3);
    expect(state.history.some((h) => h.line.includes(view.alias))).toBe(true);
  });

  it('raises an incident rather than deciding anything', () => {
    const state = game.goOut(game.startVigilante(adult('vig-2')));
    expect(state.activeEvent).not.toBeNull();
    expect(state.activeEvent!.definitionId).toBe('vigilante_incident');
    expect(state.activeEvent!.choices.map((c) => c.id).sort()).toEqual(['hard', 'police', 'walk']);
    // The body is the incident, not the definition's placeholder.
    expect(state.activeEvent!.body).not.toContain('{');
  });

  it('caps the year, and lying low ends it early', () => {
    let s = game.startVigilante(adult('vig-3'));
    for (let i = 0; i < 3; i++) s = night(s, 'police');
    expect(game.vigilante(s).nightsLeft).toBe(0);
    expect(() => game.goOut(s)).toThrow(/every night/);

    let quiet = game.startVigilante(adult('vig-4'));
    quiet = game.lieLow(quiet);
    expect(game.vigilante(quiet).nightsLeft).toBe(0);
  });

  it('makes handing them over the thing the city likes', () => {
    let kind = game.startVigilante(adult('vig-5'));
    let hard = structuredClone(kind);

    for (let year = 0; year < 6; year++) {
      for (let i = 0; i < 3; i++) {
        if (kind.vigilante) kind = night(kind, 'police');
        if (hard.vigilante) hard = night(hard, 'hard');
      }
      kind = clear(game.ageUp(kind).state);
      hard = clear(game.ageUp(hard).state);
    }

    const kindStanding = kind.vigilante?.standing ?? game.vigilante(kind).standing;
    const hardStanding = hard.vigilante?.standing ?? game.vigilante(hard).standing;
    expect(kindStanding).toBeGreaterThan(hardStanding);
    expect(hard.vigilante?.broken ?? 1).toBeGreaterThan(0);
  });

  it('lets a year off buy real distance', () => {
    let s = game.startVigilante(adult('vig-6'));
    for (let i = 0; i < 3; i++) s = night(s, 'hard');
    const hot = s.vigilante!.suspicion;
    expect(hot).toBeGreaterThan(0);

    s = clear(game.ageUp(s).state);
    if (!s.vigilante) return;
    s = game.lieLow(s);
    s = clear(game.ageUp(s).state);
    if (s.vigilante) expect(s.vigilante.suspicion).toBeLessThan(hot);
  });

  it('makes the gear the reason a mask lasts', () => {
    const bare = game.startVigilante(adult('vig-7'));
    let geared = game.startVigilante(adult('vig-7'));
    for (const id of ['mask', 'van', 'rig']) geared = game.buyGear(geared, id);

    let a = bare;
    let b = geared;
    for (let i = 0; i < 3; i++) {
      a = night(a, 'police');
      b = night(b, 'police');
    }
    expect(b.vigilante!.suspicion).toBeLessThan(a.vigilante!.suspicion);
  });

  it('ends by being found out rather than by dying, and the city decides how badly', () => {
    let unmasked = 0;
    let forgiven = 0;
    let charged = 0;

    for (let seed = 0; seed < 25; seed++) {
      let s = game.startVigilante(adult(`vig-end-${seed}`));
      s = game.buyGear(s, 'mask');
      for (let year = 0; year < 40 && s.character.alive && s.vigilante; year++) {
        for (let i = 0; i < 3 && free(s); i++) s = night(s, 'police');
        s = clear(game.ageUp(s).state);
      }
      if (s.flags.unmasked) {
        unmasked += 1;
        if (s.history.some((h) => h.line.includes('decided it was pleased'))) forgiven += 1;
        if (s.character.record.convictions.some((c) => /affray|harm/i.test(c.offence))) {
          charged += 1;
        }
      }
    }

    // It comes off eventually, and a well-liked figure is usually let off.
    expect(unmasked).toBeGreaterThan(10);
    expect(forgiven).toBeGreaterThan(unmasked / 2);
    expect(charged).toBeLessThan(unmasked);
  });

  it('turns on somebody who put people in hospital', () => {
    let brutal = 0;
    let forgiven = 0;
    for (let seed = 0; seed < 25; seed++) {
      let s = game.startVigilante(adult(`vig-hard-${seed}`));
      for (let year = 0; year < 40 && s.character.alive && s.vigilante; year++) {
        for (let i = 0; i < 3 && free(s); i++) s = night(s, 'hard');
        s = clear(game.ageUp(s).state);
      }
      if (s.flags.unmasked) {
        brutal += 1;
        if (s.history.some((h) => h.line.includes('decided it was pleased'))) forgiven += 1;
      }
    }
    expect(brutal).toBeGreaterThan(10);
    // The city does not take the side of somebody it has been reading about.
    expect(forgiven).toBeLessThan(brutal / 4);
  });

  it('refuses everything from inside a cell, and never lets you start twice', () => {
    const state = game.startVigilante(adult('vig-8'));
    expect(() => game.startVigilante(state)).toThrow(/already/);

    state.character.record.incarceration = {
      facility: 'the county jail',
      offence: 'Affray',
      totalYears: 2,
      yearsServed: 0,
      paroleEligibleIn: 1,
      behaviour: 50,
    };
    state.career.current = null;
    state.character.finances.salary = 0;
    state.education.current = null;
    expect(() => game.goOut(state)).toThrow(/in here/);
    expect(game.vigilante(state).locked).toBe('Not from in here');
  });
});
