import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { LifeState } from '@lineage/shared-types';
import { updateCostOfLiving } from '@lineage/simulation';

/**
 * Recomputes what a year of this life costs, from wherever it changed.
 *
 * `updateCostOfLiving` used to run once, in the middle of the age-up, and
 * nothing recomputed it afterwards — so anything that arrived later in the year
 * was invisible until the next one. Inherit a house in the spring and the Money
 * screen showed annual expenses *lower* than the upkeep on the house you now
 * owned; buy a car from the shop and the figure did not move at all until you
 * aged up. A total the player is shown has to be the total.
 *
 * The multiplier is where they live, which needs the content pack, which is why
 * this is here and not in the finance layer.
 */
export const recostLiving = (state: LifeState, content: ContentPack, config: GameConfig): void => {
  const country = content.countriesById.get(state.character.countryId);
  const city = country?.cities.find((c) => c.id === state.character.cityId);
  updateCostOfLiving(state, config, city?.costOfLiving ?? 1);
};
