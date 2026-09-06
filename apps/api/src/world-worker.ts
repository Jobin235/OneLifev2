import type { GameConfig } from '@lineage/config';
import { snapshot, tickWorld, NEUTRAL_INDICATORS } from '@lineage/world';
import type { WorldEvent, WorldIndicators } from '@lineage/shared-types';
import type { WorldRepository } from './store/repository.js';

/**
 * The world engine (spec §86). It runs on its own clock and never touches an
 * individual player: one cheap global tick, and every life reads the current
 * state lazily when it ages up. That is the whole scalability argument.
 *
 * In production this belongs in `apps/workers` behind BullMQ; running it in the
 * API process is a development convenience and is marked as such.
 */
export class WorldEngine {
  private indicators: WorldIndicators = NEUTRAL_INDICATORS;
  private activeEvents: WorldEvent[] = [];
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: WorldRepository,
    private readonly config: GameConfig,
  ) {}

  async start(intervalMs = 60 * 60 * 1000): Promise<void> {
    const existing = await this.repository.latest();
    if (existing) {
      this.indicators = existing.indicators;
      this.activeEvents = existing.activeEvents;
      this.tick = existing.tick;
    } else {
      await this.step();
    }
    this.timer = setInterval(() => void this.step(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async step(): Promise<void> {
    this.tick += 1;
    const result = tickWorld({
      indicators: this.indicators,
      activeEvents: this.activeEvents,
      tick: this.tick,
      config: this.config,
      random: Math.random,
      // Real-world signals plug in here. Their absence is not a failure (§91).
    });
    this.indicators = result.indicators;
    this.activeEvents = result.activeEvents;

    await this.repository.put(
      snapshot(`world_${this.tick}`, this.tick, this.indicators, this.activeEvents),
    );
  }
}
