import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';

/**
 * The two structural flaws the competitive research measured across the whole
 * category — and then found in our own game. These are the numbers, so a
 * content or scoring change cannot quietly undo them.
 */
describe('the shape of a life', () => {
  const game = createGame();

  const playOut = (seed: string) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    const decisionsByDecade = new Map<number, number>();
    const yearsByDecade = new Map<number, number>();
    const opening: string[] = [];

    while (state.character.alive) {
      const decade = Math.floor(state.character.age / 10) * 10;
      if (state.activeEvent) {
        if (opening.length < 5) opening.push(state.activeEvent.definitionId);
        decisionsByDecade.set(decade, (decisionsByDecade.get(decade) ?? 0) + 1);
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      yearsByDecade.set(decade, (yearsByDecade.get(decade) ?? 0) + 1);
      state = game.ageUp(state).state;
    }
    return { state, decisionsByDecade, yearsByDecade, opening: opening.join(',') };
  };

  it('does not run the same opening in every life', () => {
    /*
     * Measured at 9 distinct openings out of 30 before the early-life content
     * existed — because at age five exactly one event could fire. This is the
     * number behind the category's single most common review complaint, "the
     * same things happen in different lives".
     */
    const openings = new Set<string>();
    for (let i = 0; i < 25; i++) openings.add(playOut(`shape-open-${i}`).opening);
    expect(openings.size).toBeGreaterThan(20);
  });

  it('keeps giving the player decisions after sixty', () => {
    /*
     * Measured at 0.42 decisions per lived year in the sixties and 0.02 in the
     * eighties: a player who reached seventy had nothing left but the button.
     * Old age is allowed to be quieter than mid-life, not empty.
     */
    const decisions = new Map<number, number>();
    const years = new Map<number, number>();

    for (let i = 0; i < 24; i++) {
      const life = playOut(`shape-late-${i}`);
      for (const [decade, n] of life.decisionsByDecade) {
        decisions.set(decade, (decisions.get(decade) ?? 0) + n);
      }
      for (const [decade, n] of life.yearsByDecade) {
        years.set(decade, (years.get(decade) ?? 0) + n);
      }
    }

    const rate = (decade: number) => (decisions.get(decade) ?? 0) / (years.get(decade) || 1);
    const midLife = (rate(30) + rate(40)) / 2;

    expect(rate(60)).toBeGreaterThan(midLife * 0.6);
    // The seventies are quieter, but a decade of nothing is a bug.
    expect(rate(70)).toBeGreaterThan(0.15);
  });

  it('fills the early years too', () => {
    // Age five once had a single eligible event; the whole childhood was four
    // cards in the same order.
    const atFive = game.content.events.filter(
      (e) => (e.minAge ?? 0) <= 5 && 5 <= (e.maxAge ?? 140),
    );
    expect(atFive.length).toBeGreaterThanOrEqual(4);
  });
});
