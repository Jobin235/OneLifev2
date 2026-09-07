import type { Snapshot } from '@lineage/game';
import type { LifeState, WorldSnapshot } from '@lineage/shared-types';
import type { LifeRepository, WorldRepository } from './repository.js';

/**
 * The development and test implementation. Deliberately simple, and deliberately
 * honest about being in-process: `withLock` here serialises within one server,
 * which is enough for local play but not for more than one API instance.
 */
export class InMemoryLifeRepository implements LifeRepository {
  private readonly lives = new Map<string, { userId: string; state: LifeState }>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly idempotency = new Map<string, unknown>();
  private readonly histories = new Map<string, Snapshot[]>();

  async history(userId: string, lifeId: string): Promise<Snapshot[]> {
    return this.histories.get(`${userId}:${lifeId}`) ?? [];
  }

  async putHistory(userId: string, lifeId: string, history: Snapshot[]): Promise<void> {
    this.histories.set(`${userId}:${lifeId}`, history);
  }

  async create(userId: string, state: LifeState): Promise<void> {
    this.lives.set(state.id, { userId, state: structuredClone(state) });
  }

  async get(userId: string, lifeId: string): Promise<LifeState | null> {
    const row = this.lives.get(lifeId);
    if (!row || row.userId !== userId) return null;
    return structuredClone(row.state);
  }

  async save(userId: string, state: LifeState): Promise<void> {
    const row = this.lives.get(state.id);
    if (!row || row.userId !== userId) throw new Error('life not found');
    row.state = structuredClone(state);
  }

  async listForUser(userId: string) {
    return [...this.lives.values()]
      .filter((row) => row.userId === userId)
      .map((row) => ({
        id: row.state.id,
        name: `${row.state.character.firstName} ${row.state.character.lastName}`,
        age: row.state.character.age,
        alive: row.state.character.alive,
      }));
  }

  async withLock<T>(
    userId: string,
    lifeId: string,
    mutate: (state: LifeState) => Promise<T> | T,
  ): Promise<T> {
    const key = `${userId}:${lifeId}`;
    const previous = this.locks.get(key) ?? Promise.resolve();

    const run = previous.then(async () => {
      const state = await this.get(userId, lifeId);
      if (!state) throw new Error('life not found');
      const result = await mutate(state);
      await this.save(userId, state);
      return result;
    });

    // Keep the chain alive even when a request fails, or the lock deadlocks.
    this.locks.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }

  async rememberResult(key: string, result: unknown): Promise<void> {
    this.idempotency.set(key, structuredClone(result));
  }

  async recallResult<T>(key: string): Promise<T | null> {
    const found = this.idempotency.get(key);
    return found === undefined ? null : (structuredClone(found) as T);
  }
}

export class InMemoryWorldRepository implements WorldRepository {
  private readonly snapshots = new Map<string, WorldSnapshot>();
  private latestId: string | null = null;

  async latest(): Promise<WorldSnapshot | null> {
    return this.latestId ? (this.snapshots.get(this.latestId) ?? null) : null;
  }

  async byId(id: string): Promise<WorldSnapshot | null> {
    return this.snapshots.get(id) ?? null;
  }

  async put(snapshot: WorldSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
    this.latestId = snapshot.id;
  }
}
