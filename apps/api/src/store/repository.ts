import type { LifeState, WorldSnapshot } from '@lineage/shared-types';

/**
 * The persistence boundary (spec §128).
 *
 * The simulation depends on this interface, never on a database driver. That is
 * what lets the whole engine be tested without Postgres, and what lets the
 * storage choice change without touching a single game rule.
 */
export interface LifeRepository {
  create(userId: string, state: LifeState): Promise<void>;
  /** Returns null when the life does not exist or does not belong to the user. */
  get(userId: string, lifeId: string): Promise<LifeState | null>;
  save(userId: string, state: LifeState): Promise<void>;
  listForUser(userId: string): Promise<Array<{ id: string; name: string; age: number; alive: boolean }>>;

  /**
   * Runs `mutate` under a lock on this life, so two AGE UP requests arriving at
   * once cannot both succeed (spec §85).
   */
  withLock<T>(userId: string, lifeId: string, mutate: (state: LifeState) => Promise<T> | T): Promise<T>;

  /** Idempotency (spec §84): a retried request returns the first result. */
  rememberResult(key: string, result: unknown): Promise<void>;
  recallResult<T>(key: string): Promise<T | null>;
}

export interface WorldRepository {
  latest(): Promise<WorldSnapshot | null>;
  byId(id: string): Promise<WorldSnapshot | null>;
  put(snapshot: WorldSnapshot): Promise<void>;
}
