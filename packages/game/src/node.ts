import type { GameConfig } from '@lineage/config';
import { loadContent } from '@lineage/content/node';
import { Game } from './game.js';

/**
 * The Node entry point: reads content from disk and builds a Game with it.
 *
 * Deliberately not re-exported from `index.ts`. Importing it pulls `node:fs` in,
 * and the client bundles this same engine — so the filesystem dependency stays
 * quarantined to the one module that actually needs it.
 */
export const createGame = (config?: GameConfig): Game =>
  new Game({ content: loadContent(), ...(config ? { config } : {}) });
