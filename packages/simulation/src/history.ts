import type { LifeState } from '@lineage/shared-types';
import { makeId } from './rng.js';

/**
 * Appends a line to the life log.
 *
 * This lives in the simulation rather than the composition root because
 * anything that changes a life should be able to say so. When it lived higher
 * up, the effect handlers could not reach it — which is why losing a job used
 * to happen silently, the header simply going blank with nothing in the log to
 * explain it.
 */
export const pushHistory = (
  state: LifeState,
  category: string,
  icon: string,
  line: string,
  significance: number,
  npcIds: string[] = [],
): void => {
  const entry = {
    id: makeId('his', state.seed, line, state.character.age, state.history.length),
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
