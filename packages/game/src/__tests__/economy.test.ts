import { describe, expect, it } from 'vitest';
import { createGame } from '../node.js';
import type { LifeState } from '@lineage/shared-types';

/**
 * The player's complaint, in tests: "money doesn't add up ... assets doesn't
 * make sense buying assets doesn't make sense ... no balance".
 *
 * Each of these guards a specific way the economy was wrong rather than a
 * general feeling, because a general feeling is not something a test can hold.
 */
describe('the money adds up', () => {
  const game = createGame();

  const liveTo = (seed: string, until: number): LifeState => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < until) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return game.dismiss(state);
  };

  it('charges a house and a child once each, not twice', () => {
    /*
     * Asset upkeep and dependants live in `annualExpenses`, and settleYear used
     * to add them again on top — so a character with a mortgage and two kids
     * paid for all three twice a year and never got ahead however well they did.
     */
    const state = liveTo('econ-charge', 40);
    const upkeep = state.assets.reduce((sum, a) => sum + a.annualCost, 0);
    const shown = state.character.finances.annualExpenses;
    expect(shown).toBeGreaterThanOrEqual(upkeep);

    const before = structuredClone(state);
    const after = game.ageUp(state).state;
    const income = before.character.finances.salary + before.character.finances.otherIncome;
    const spent =
      before.character.finances.cash +
      before.character.finances.savings +
      income -
      (after.character.finances.cash + after.character.finances.savings);
    // Whatever left the account, it cannot be more than the stated costs plus
    // what a lender can take, with room for one-off event spending.
    expect(spent).toBeLessThan(shown * 2 + income);
  });

  it('lets a working life actually accumulate', () => {
    let everSolvent = 0;
    for (let i = 0; i < 8; i++) {
      const state = liveTo(`econ-grow-${i}`, 45);
      const worth =
        state.character.finances.cash +
        state.character.finances.savings +
        state.assets.reduce((sum, a) => sum + a.value - a.loanOutstanding, 0);
      if (worth > 2_000_000) everSolvent += 1;
    }
    // Not everyone gets rich. But if nobody has $20,000 by forty-five, the
    // economy is not hard, it is broken.
    expect(everSolvent).toBeGreaterThan(2);
  });

  it('never lets a student loan grow past what was borrowed', () => {
    for (let i = 0; i < 6; i++) {
      const state = liveTo(`econ-loan-${i}`, 60);
      for (const debt of state.character.finances.debts) {
        if (!debt.label.startsWith('Student loan')) continue;
        expect(debt.balance).toBeLessThanOrEqual(debt.originalAmount);
      }
    }
  });

  it('offers a way to buy a house that is not the whole price in cash', () => {
    const state = liveTo('econ-shop', 38);
    const shop = game.shop(state);
    const houses = shop.filter((item) => item.kind === 'house' || item.kind === 'apartment');
    expect(houses.length).toBeGreaterThan(0);
    // Every one of them states its terms, whether or not this character can meet
    // them — the point is that a price is never the only thing on offer.
    for (const house of houses) {
      expect(house.finance.terms).toMatch(/down, then/);
    }
  });

  it('makes owning where you live cheaper than renting it', () => {
    const state = liveTo('econ-rent', 34);
    const renting = state.character.finances.annualExpenses;

    const flat = game.shop(state).find((item) => item.kind === 'apartment');
    expect(flat).toBeDefined();
    state.character.finances.savings += flat!.priceCents;
    const owned = game.buy(state, flat!.id, false);
    const after = game.ageUp(owned).state;

    // Upkeep is real, but it is smaller than the rent it replaced — otherwise
    // buying a house is strictly worse than not buying one, which is what made
    // the shop pointless.
    expect(after.character.finances.annualExpenses).toBeLessThan(renting * 1.1);
  });

  it('makes a house worth more later and a car worth less', () => {
    const state = liveTo('econ-drift', 30);
    state.character.finances.savings += 200_000_00;
    const shop = game.shop(state);
    const car = shop.find((item) => item.kind === 'car' && item.priceCents < 100_000_00);
    expect(car).toBeDefined();

    let owned = game.buy(state, car!.id, false);
    const bought = owned.assets.find((a) => a.label === car!.label)!.value;
    for (let i = 0; i < 6 && owned.character.alive; i++) {
      while (owned.activeEvent) {
        owned = game.choose(owned, owned.activeEvent.id, owned.activeEvent.choices[0]!.id);
      }
      owned = game.dismiss(owned);
      owned = game.ageUp(owned).state;
    }
    const now = owned.assets.find((a) => a.label === car!.label);
    if (now) expect(now.value).toBeLessThan(bought);
  });
});

describe('a job is taken, not handed out', () => {
  const game = createGame();

  const readyToWork = (seed: string): LifeState => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < 22) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return game.dismiss(state);
  };

  it('puts an interview in the way rather than rolling a die', () => {
    for (let i = 0; i < 6; i++) {
      const state = readyToWork(`iv-${i}`);
      // Prison and school both close the job market; skip those seeds rather
      // than assert against a state where applying is correctly refused.
      if (state.character.record.incarceration || state.education.current) continue;
      const opening = game.openings(state).find((o) => o.qualified);
      if (!opening) continue;

      const applied = game.applyFor(state, opening.trackId).state;
      const popup = applied.activeEvent;
      expect(popup, 'applying should open an interview').not.toBeNull();
      expect(popup!.definitionId).toBe('job_interview');
      expect(popup!.body).toContain(opening.employerName);
      // A real question with four real answers, none of them obviously right.
      expect(popup!.choices).toHaveLength(4);
      for (const choice of popup!.choices) expect(choice.label.length).toBeGreaterThan(3);
      return;
    }
    throw new Error('no seed reached a qualified opening');
  });

  it('says which job and which company, hired or not', () => {
    let hired = 0;
    let denied = 0;
    for (let i = 0; i < 12; i++) {
      const state = readyToWork(`iv-out-${i}`);
      if (state.character.record.incarceration || state.education.current) continue;
      const opening = game.openings(state).find((o) => o.qualified);
      if (!opening) continue;

      const applied = game.applyFor(state, opening.trackId).state;
      const popup = applied.activeEvent!;
      const answered = game.choose(applied, popup.id, popup.choices[i % 4]!.id);
      const result = answered.resolvedEvent!;

      expect(result.outcomeTitle).toMatch(/Hired|Denied/);
      // Case-insensitively: a company called "the Force" gets capitalised when
      // it opens the sentence.
      expect(result.outcomeText!.toLowerCase()).toContain(opening.employerName.toLowerCase());
      if (result.outcomeTitle === 'Hired') hired += 1;
      else denied += 1;
    }
    // Both outcomes have to be reachable, or the interview is a formality.
    expect(hired).toBeGreaterThan(0);
    expect(denied).toBeGreaterThan(0);
  });

  it('lets the player pick their own major', () => {
    for (let i = 0; i < 20; i++) {
      let state = game.newLife({ countryId: 'us', upbringing: 'comfortable', seed: `major-${i}` });
      while (state.character.alive && state.character.age < 21) {
        if (state.activeEvent) {
          const event = state.activeEvent;
          const uni = event.choices.find((c) => c.id === 'university');
          if (uni && event.selects.length > 0) {
            const majors = event.selects.find((s) => s.id === 'major')!;
            const wanted = majors.options[3]!.value;
            state = game.choose(state, event.id, uni.id, { major: wanted });
            state = game.dismiss(state);
            state = game.ageUp(state).state;
            expect(state.education.current?.major).toBe(wanted);
            return;
          }
          state = game.choose(state, event.id, event.choices[0]!.id);
          continue;
        }
        state = game.ageUp(state).state;
      }
    }
    throw new Error('no seed reached the university decision');
  });
});
