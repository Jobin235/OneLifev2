import type { Game } from '../game.js';
import type { LifeState } from '@lineage/shared-types';

/**
 * A living adult, whatever the balance is doing this week.
 *
 * Fixtures that ran a life forward to a fixed age and assumed it arrived kept
 * breaking whenever mortality moved — six tests failed at once when the stat
 * curves were rebalanced, none of them because the thing under test had
 * changed. Retrying the seed is both more honest about what the fixture wants
 * ("somebody alive at 25") and stops the suite reporting balance work as
 * regressions.
 */
export const livingAdult = (
  game: Game,
  seed: string,
  options: {
    toAge?: number;
    countryId?: string;
    upbringing?: 'rough' | 'getting_by' | 'comfortable';
    /** Cleared afterwards, since almost nothing is reachable from inside. */
    freeOfPrison?: boolean;
  } = {},
): LifeState => {
  const { toAge = 25, countryId = 'us', upbringing = 'comfortable', freeOfPrison = true } = options;

  for (let attempt = 0; attempt < 40; attempt++) {
    let state = game.newLife({
      countryId,
      upbringing,
      seed: attempt === 0 ? seed : `${seed}-${attempt}`,
    });
    while (state.character.alive && state.character.age < toAge) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    if (!state.character.alive) continue;

    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    state = game.dismiss(state);
    if (freeOfPrison) {
      state.character.record.incarceration = null;
      state.career.current = state.career.current;
    }
    return state;
  }
  throw new Error(`no seed near "${seed}" produced somebody alive at ${toAge}`);
};
