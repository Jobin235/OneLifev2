import type { LifeState } from '@lineage/shared-types';
import { hashString } from './rng.js';

/**
 * Appends a line to the life log.
 *
 * This lives in the simulation rather than the composition root because
 * anything that changes a life should be able to say so. When it lived higher
 * up, the effect handlers could not reach it — which is why losing a job used
 * to happen silently, the header simply going blank with nothing in the log to
 * explain it.
 */
/**
 * A history id that cannot collide with another one in the same life.
 *
 * These used to be a 32-bit FNV hash of the seed, the line, the age and the
 * length — which is unique only by luck, and with four hundred entries in a
 * long life the birthday problem catches up: roughly one life in fifty
 * thousand threw `history_ids_unique` and lost the year. The position in the
 * list is unique by construction and just as deterministic under a rewind,
 * because a replayed year pushes the same entries back in the same order.
 */
const historyId = (state: LifeState): string =>
  `his_${hashString(state.seed).toString(36)}_${state.history.length}`;

export const pushHistory = (
  state: LifeState,
  category: string,
  icon: string,
  line: string,
  significance: number,
  npcIds: string[] = [],
): void => {
  const entry = {
    id: historyId(state),
    atAge: state.character.age,
    category: category as never,
    icon,
    line,
    significance,
    eventInstanceId: null,
    npcIds,
  };
  state.history.push(entry);
  state.currentYearEntryIds.push(entry.id);
};
