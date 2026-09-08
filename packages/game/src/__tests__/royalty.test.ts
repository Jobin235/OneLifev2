import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import { lifeView } from '../views.js';
import type { LifeState } from '@lineage/shared-types';

const game = createGame();

/**
 * Royalty.
 *
 * The one thing in this game that is not earned, and the only position that can
 * be taken back. These tests are mostly about that second half: what respect
 * buys, what it costs, and what happens at nothing.
 */
describe('a title', () => {
  const clear = (state: LifeState): LifeState => {
    let s = state;
    while (s.activeEvent) s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
    return game.dismiss(s);
  };

  /** Someone born to it, found by searching seeds rather than by faking one. */
  const bornRoyal = (): LifeState => {
    for (let i = 0; i < 400; i++) {
      let s = game.newLife({ countryId: 'dk', upbringing: 'getting_by', seed: `royal-${i}` });
      s = clear(game.ageUp(s).state);
      if (s.royal) return s;
    }
    throw new Error('no seed produced a royal birth');
  };

  it('is only handed out where there is a crown', () => {
    for (let i = 0; i < 60; i++) {
      let s = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed: `us-${i}` });
      s = clear(game.ageUp(s).state);
      expect(s.royal).toBeNull();
      expect(game.royal(s)).toBeNull();
    }
  });

  it('is rare even where there is one', () => {
    let royal = 0;
    for (let i = 0; i < 300; i++) {
      let s = game.newLife({ countryId: 'dk', upbringing: 'getting_by', seed: `rate-${i}` });
      s = clear(game.ageUp(s).state);
      if (s.royal) royal += 1;
    }
    // Uncommon enough to mean something, common enough to be findable.
    expect(royal).toBeGreaterThan(2);
    expect(royal / 300).toBeLessThan(0.12);
  });

  it('names the title, the house and the standing', () => {
    const state = bornRoyal();
    const view = game.royal(state)!;
    expect(view.title.length).toBeGreaterThan(3);
    expect(view.house).toContain('House');
    expect(view.origin).toBe('Born to it');
    expect(view.respect).toBeGreaterThan(50);
    expect(state.history.some((h) => h.line.includes('You were born'))).toBe(true);
    // And the header says it, rather than whatever job they happen to hold.
    expect(lifeView(state, game.content).station).toBe(view.title);
  });

  it('trades respect both ways, and says which', () => {
    let state = bornRoyal();
    state.character.age = 30;
    state.character.record.incarceration = null;

    const before = state.royal!.respect;
    const good = game.royalAct(state, 'public_service');
    expect(good.respectAfter).toBeGreaterThan(before);
    expect(good.line.length).toBeGreaterThan(20);

    const bad = game.royalAct(good.state, 'public_disservice');
    expect(bad.respectAfter).toBeLessThan(good.respectAfter);
  });

  it('caps the year, so a bad decision cannot be undone the same afternoon', () => {
    let state = bornRoyal();
    state.character.age = 30;
    state.character.record.incarceration = null;

    for (let i = 0; i < 3; i++) state = game.royalAct(state, 'public_service').state;
    expect(game.royal(state)!.dutiesLeft).toBe(0);
    expect(() => game.royalAct(state, 'public_service')).toThrow(/enough this year/);

    // The allowance comes back with the birthday.
    state = clear(game.ageUp(state).state);
    if (state.royal) expect(game.royal(state)!.dutiesLeft).toBe(3);
  });

  it('keeps the laws and the executions for whoever wears the crown', () => {
    const state = bornRoyal();
    state.character.age = 30;
    state.character.record.incarceration = null;
    if (state.royal!.rank === 'monarch') return;

    expect(() => game.royalAct(state, 'execute')).toThrow(/only the crown/i);
    expect(() => game.royalAct(state, 'law_review')).toThrow(/laws do not come to you/i);
  });

  it('takes the title back when the country has had enough', () => {
    let state = bornRoyal();
    state.character.age = 34;
    state.character.record.incarceration = null;
    const banked = state.character.finances.savings;

    // Spend it all, three a year, until there is nothing left to spend.
    for (let year = 0; year < 20 && state.royal; year++) {
      for (let i = 0; i < 3 && state.royal; i++) {
        state = game.royalAct(state, 'public_disservice').state;
      }
      if (!state.royal) break;
      state = clear(game.ageUp(state).state);
    }

    expect(state.royal).toBeNull();
    expect(state.flags.exiled).toBe(true);
    expect(state.character.finances.savings).toBeLessThan(banked);
    expect(state.history.some((h) => h.line.includes('stripped of the title'))).toBe(true);
  });

  it('lets a royal walk away and keep the money', () => {
    let state = bornRoyal();
    state.character.age = 30;
    state.character.record.incarceration = null;
    const banked = state.character.finances.savings;

    const result = game.royalAct(state, 'abdicate');
    expect(result.state.royal).toBeNull();
    expect(result.state.flags.abdicated).toBe(true);
    // Not stripped: abdication leaves you far better off than a revolt does.
    expect(result.state.character.finances.savings).toBeGreaterThan(banked * 0.4);
    expect(result.state.flags.exiled).toBeUndefined();
  });

  it('puts a prince on the throne inside a lifetime', () => {
    let crowned = 0;
    let inLine = 0;
    for (let i = 0; i < 900 && crowned < 4; i++) {
      let s = game.newLife({ countryId: 'dk', upbringing: 'getting_by', seed: `throne-${i}` });
      s = clear(game.ageUp(s).state);
      if (s.royal?.inLine === null || s.royal === null) continue;
      inLine += 1;
      while (s.character.alive) {
        if (s.activeEvent) {
          s = game.choose(s, s.activeEvent.id, s.activeEvent.choices[0]!.id);
          continue;
        }
        s = game.ageUp(s).state;
        if (s.royal?.rank === 'monarch') {
          crowned += 1;
          expect(s.history.some((h) => h.line.includes('now.'))).toBe(true);
          break;
        }
      }
    }
    expect(inLine).toBeGreaterThan(0);
    expect(crowned).toBeGreaterThan(0);
  });

  it('offers a royal to somebody looking, and a title to whoever marries one', () => {
    const ROYAL = /^(Baron|Baroness|Viscount|Viscountess|Earl|Countess|Marquess|Marchioness|Duke|Duchess|Prince|Princess)$/;
    let met = 0;
    let married = 0;

    for (let i = 0; i < 120 && married < 2; i++) {
      let s = game.newLife({ countryId: 'dk', upbringing: 'getting_by', seed: `wed-${i}` });
      while (s.character.alive) {
        if (s.activeEvent) {
          const event = s.activeEvent;
          if (event.definitionId === 'love_interest') {
            const royal = ROYAL.test(String(s.flags.love_job ?? ''));
            if (royal) met += 1;
            // Hold out for a title, the way a player after one would.
            s = game.choose(s, event.id, royal ? event.choices[0]!.id : event.choices[1]!.id);
          } else {
            s = game.choose(s, event.id, event.choices[0]!.id);
          }
          continue;
        }
        const looking = game.actions(s).find((a) => a.id === 'find_a_date' && a.available);
        if (looking) {
          s = game.act(s, 'find_a_date').state;
          continue;
        }
        s = game.ageUp(s).state;
        if (s.royal?.by === 'marriage') {
          married += 1;
          expect(s.royal.title.length).toBeGreaterThan(3);
          break;
        }
      }
    }
    expect(met).toBeGreaterThan(0);
    expect(married).toBeGreaterThan(0);
  });
});
