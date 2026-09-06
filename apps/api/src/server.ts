import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { DEFAULT_CONFIG } from '@lineage/config';
import { createGame } from '@lineage/game/node';
import { registerLifeRoutes } from './routes/lives.js';
import { InMemoryLifeRepository, InMemoryWorldRepository } from './store/memory.js';
import { WorldEngine } from './world-worker.js';

export const buildServer = async () => {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
  });

  await app.register(cors, { origin: true });

  /*
   * Several endpoints take no body — age-up, dismiss. A client that sets a JSON
   * content-type anyway is being sloppy, not malicious, and returning 400 for it
   * turns a header nit into "the game will not let me age up".
   */
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      const text = String(body).trim();
      if (text.length === 0) return done(null, {});
      try {
        done(null, JSON.parse(text));
      } catch {
        const error = new Error('Invalid JSON') as Error & { statusCode?: number };
        error.statusCode = 400;
        done(error, undefined);
      }
    },
  );

  // Spec §180: the client must never be able to spam simulation requests.
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => String(request.headers['x-user-id'] ?? request.ip),
  });

  const game = createGame();
  const lives = new InMemoryLifeRepository();
  const worldRepo = new InMemoryWorldRepository();

  const worldEngine = new WorldEngine(worldRepo, DEFAULT_CONFIG);
  await worldEngine.start(Number(process.env.WORLD_TICK_MS ?? 60 * 60 * 1000));

  app.get('/health', async () => ({
    ok: true,
    contentVersion: game.content.version,
    events: game.content.events.length,
  }));

  registerLifeRoutes(app, game, lives, worldRepo);

  app.addHook('onClose', async () => worldEngine.stop());

  return app;
};

const isEntrypoint = process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts');

if (isEntrypoint) {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3000);
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}
