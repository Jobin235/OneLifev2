import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApplicationRejected, AuditionRejected, CasinoRejected, EscapeRejected, MarketRejected, MobRejected, RacingRejected, VampireRejected, VentureRejected, VigilanteRejected, RoyalRejected, ChoiceRejected, InteractionRejected, PurchaseRejected, Game, lifeView, moneyView, moreView, peopleView, personView, prisonView, schoolView, workView, actionsView, forget, remember, rewind, rewindOptions } from '@lineage/game';
import { InvariantViolation } from '@lineage/simulation';
import { NEUTRAL_INDICATORS } from '@lineage/world';
import type { LifeRepository, WorldRepository } from '../store/repository.js';

const NewLifeBody = z.object({
  firstName: z.string().min(1).max(40).optional(),
  lastName: z.string().min(1).max(40).optional(),
  sex: z.enum(['male', 'female']).optional(),
  countryId: z.string().min(1),
  cityId: z.string().min(1).optional(),
  upbringing: z.enum(['rough', 'getting_by', 'comfortable']),
});

const RewindBody = z.object({ toAge: z.number().int().min(0) });
const ManageBody = z.object({ action: z.string().min(1), amenityId: z.string().optional() });
const AuditionBody = z.object({ trackId: z.string().min(1) });
const RoyalBody = z.object({ action: z.string().min(1), choice: z.string().optional() });
const MobBody = z.object({ job: z.string().min(1) });
const CasinoBody = z.object({
  game: z.enum(['slots', 'roulette', 'horses']),
  stake: z.number().int().min(1),
  pick: z.string().default(''),
});
const BlackjackBody = z.object({
  action: z.enum(['deal', 'hit', 'stand', 'double']),
  /** Only read on a deal; the bet cannot change once the cards are out. */
  stake: z.number().int().min(1).optional(),
});
const BlackMarketBody = z.object({
  action: z.enum(['buy', 'haggle', 'fence']),
  dealerId: z.string().optional(),
  itemId: z.string().optional(),
  assetId: z.string().optional(),
});
const RacingBody = z.object({
  action: z.enum(['garage', 'car', 'mod', 'race']),
  carId: z.string().optional(),
  assetId: z.string().optional(),
  modId: z.string().optional(),
  style: z.enum(['conserve', 'steady', 'push']).default('steady'),
});
const VigilanteBody = z.object({
  action: z.enum(['start', 'out', 'gear', 'low']),
  gearId: z.string().optional(),
});
const VampireBody = z.object({
  action: z.enum(['turn', 'hunt', 'bank', 'hypnotise', 'coffin']),
});
const VentureBody = z.object({
  /** One of: start a venture, do one of its things, or build something. */
  action: z.enum(['start', 'act', 'upgrade']),
  kind: z.enum(['cult', 'zoo', 'agency']).optional(),
  tierId: z.string().optional(),
  ventureId: z.string().optional(),
  id: z.string().optional(),
});
const EscapeBody = z.object({
  move: z.enum(['up', 'down', 'left', 'right', 'start', 'surrender']),
});
const TradeBody = z.object({
  stockId: z.string().min(1),
  shares: z.number().int().min(1),
  sell: z.boolean().default(false),
});
const ChooseBody = z.object({
  choiceId: z.string().min(1),
  /** What the player picked in the popup's dropdowns, keyed by select id. */
  selections: z.record(z.string(), z.string()).default({}),
});
const ActBody = z.object({ activityId: z.string().min(1) });
const SucceedBody = z.object({ heirNpcId: z.string().nullable() });

/**
 * Everything here is server-authoritative (spec §82). No route accepts an age, a
 * balance, or an outcome from the client — only the *intent*, which the engine
 * then validates against state the client cannot reach.
 */
export const registerLifeRoutes = (
  app: FastifyInstance,
  game: Game,
  lives: LifeRepository,
  world: WorldRepository,
): void => {
  const userOf = (request: { headers: Record<string, unknown> }): string => {
    // Placeholder for real auth (spec §77). Swapped for a verified token subject.
    const header = request.headers['x-user-id'];
    return typeof header === 'string' && header.length > 0 ? header : 'dev-user';
  };

  const currentWorld = async () => (await world.latest())?.indicators ?? NEUTRAL_INDICATORS;

  const load = async (userId: string, lifeId: string) => {
    const state = await lives.get(userId, lifeId);
    if (!state) {
      const error = new Error('life not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    return state;
  };

  app.get('/content/countries', async () => ({
    countries: game.content.countries.map((c) => ({
      id: c.id,
      name: c.name,
      flag: c.flag,
      region: c.region,
      changes: c.changes,
      cities: c.cities.map((city) => ({ id: city.id, name: city.name, blurb: city.blurb })),
    })),
  }));

  app.get('/lives', async (request) => ({ lives: await lives.listForUser(userOf(request)) }));

  app.post('/lives', async (request, reply) => {
    const body = NewLifeBody.parse(request.body);
    const userId = userOf(request);

    if (!game.content.countriesById.has(body.countryId)) {
      return reply.code(400).send({ error: 'unknown country' });
    }

    // The seed is generated here, never accepted from the client — otherwise a
    // player could reroll their starting conditions until they liked them.
    const seed = `${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const state = game.newLife({ ...body, seed });
    await lives.create(userId, state);

    return reply.code(201).send({ life: lifeView(state, game.content) });
  });

  app.get('/lives/:lifeId', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    return { life: lifeView(state, game.content) };
  });

  /**
   * Idempotent (spec §84): a client that retries after a dropped connection gets
   * the first result back rather than ageing the character twice.
   */
  app.post('/lives/:lifeId/age-up', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const userId = userOf(request);
    const idempotencyKey = request.headers['idempotency-key'];

    if (typeof idempotencyKey === 'string') {
      const cached = await lives.recallResult<unknown>(`${userId}:${lifeId}:${idempotencyKey}`);
      if (cached) return reply.header('idempotent-replay', 'true').send(cached);
    }

    const indicators = await currentWorld();

    try {
      const history = await lives.history(userId, lifeId);
      let remembered = history;
      const payload = await lives.withLock(userId, lifeId, (state) => {
        // Taken before the year runs, so rewinding to it un-lives that year.
        remembered = remember(history, state);
        const result = game.ageUp(state, indicators);
        return {
          life: lifeView(result.state, game.content),
          recap: result.recap,
          died: result.died,
        };
      });
      await lives.putHistory(userId, lifeId, remembered);

      if (typeof idempotencyKey === 'string') {
        await lives.rememberResult(`${userId}:${lifeId}:${idempotencyKey}`, payload);
      }
      return payload;
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.post('/lives/:lifeId/events/:eventId/choose', async (request, reply) => {
    const { lifeId, eventId } = request.params as { lifeId: string; eventId: string };
    const { choiceId, selections } = ChooseBody.parse(request.body);
    const userId = userOf(request);
    const indicators = await currentWorld();

    try {
      const payload = await lives.withLock(userId, lifeId, (state) => {
        game.choose(state, eventId, choiceId, selections, indicators);
        return { life: lifeView(state, game.content) };
      });
      return payload;
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.post('/lives/:lifeId/dismiss', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        game.dismiss(state);
        return { life: lifeView(state, game.content) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.post('/lives/:lifeId/act', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { activityId } = ActBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        const { outcome } = game.act(state, activityId);
        return { life: lifeView(state, game.content), outcome };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.post('/lives/:lifeId/succeed', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { heirNpcId } = SucceedBody.parse(request.body);
    const userId = userOf(request);
    const previous = await load(userId, lifeId);

    try {
      const seed = `${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const next = game.succeed(previous, heirNpcId, seed);
      await lives.create(userId, next);
      return reply.code(201).send({ life: lifeView(next, game.content) });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/people', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return peopleView(await load(userOf(request), lifeId));
  });

  app.get('/lives/:lifeId/people/:npcId', async (request, reply) => {
    const { lifeId, npcId } = request.params as { lifeId: string; npcId: string };
    const state = await load(userOf(request), lifeId);
    const person = personView(state, npcId, game.config, game.content);
    if (!person) return reply.code(404).send({ error: 'no such person in this life' });
    return person;
  });

  /**
   * Doing something to one specific person. Server-authoritative like every
   * other mutation: the client's menu renders what the server said was
   * possible, it never decides it.
   */
  app.post('/lives/:lifeId/people/:npcId/interact', async (request, reply) => {
    const { lifeId, npcId } = request.params as { lifeId: string; npcId: string };
    const { interactionId } = request.body as { interactionId: string };
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        const { warm, line, meter } = game.interact(state, npcId, interactionId);
        return {
          life: lifeView(state, game.content),
          person: personView(state, npcId, game.config, game.content),
          warm,
          line,
          meter,
        };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.post('/lives/:lifeId/buy', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { purchasableId, onFinance } = request.body as {
      purchasableId: string;
      onFinance?: boolean;
    };
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        game.buy(state, purchasableId, onFinance === true);
        return { life: lifeView(state, game.content), money: moneyView(state, game.config, game.content) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.post('/lives/:lifeId/sell', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { assetId } = request.body as { assetId: string };
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        game.sell(state, assetId);
        return { life: lifeView(state, game.content), money: moneyView(state, game.config, game.content) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/openings', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    return {
      openings: game.openings(state),
      applicationsLeft: Math.max(0, 3 - (state.applicationsThisYear ?? 0)),
    };
  });

  app.post('/lives/:lifeId/apply', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { trackId } = request.body as { trackId: string };
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        const { hired, line } = game.applyFor(state, trackId);
        return { life: lifeView(state, game.content), hired, line };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/actions', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    return { actions: actionsView(state, game.content) };
  });

  app.get('/lives/:lifeId/money', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return moneyView(await load(userOf(request), lifeId), game.config, game.content);
  });

  app.get('/lives/:lifeId/work', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const view = workView(await load(userOf(request), lifeId), game.content);
    if (!view) return reply.code(404).send({ error: 'not working' });
    return view;
  });

  app.get('/lives/:lifeId/school', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const view = schoolView(await load(userOf(request), lifeId), game.content);
    if (!view) return reply.code(404).send({ error: 'not enrolled' });
    return view;
  });

  app.get('/lives/:lifeId/rewind', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const userId = userOf(request);
    const state = await load(userId, lifeId);
    return { options: rewindOptions(await lives.history(userId, lifeId), state) };
  });

  app.post('/lives/:lifeId/rewind', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { toAge } = RewindBody.parse(request.body);
    const userId = userOf(request);
    try {
      const history = await lives.history(userId, lifeId);
      const payload = await lives.withLock(userId, lifeId, (state) => {
        const restored = rewind(history, state, toAge);
        // The mutate callback saves whatever it leaves in `state`.
        Object.assign(state, restored);
        return { life: lifeView(state, game.content) };
      });
      await lives.putHistory(userId, lifeId, forget(history, toAge));
      return payload;
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/properties', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    return { properties: game.properties(state) };
  });

  app.get('/lives/:lifeId/properties/:assetId/amenities', async (request) => {
    const { lifeId, assetId } = request.params as { lifeId: string; assetId: string };
    const state = await load(userOf(request), lifeId);
    return { amenities: game.amenities(state, assetId) };
  });

  app.post('/lives/:lifeId/properties/:assetId', async (request, reply) => {
    const { lifeId, assetId } = request.params as { lifeId: string; assetId: string };
    const { action, amenityId } = ManageBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        game.manageProperty(state, assetId, action, amenityId);
        return { life: lifeView(state, game.content), properties: game.properties(state) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/fame', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.fame(await load(userOf(request), lifeId));
  });

  app.post('/lives/:lifeId/audition', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { trackId } = AuditionBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        game.audition(state, trackId);
        return { life: lifeView(state, game.content) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/royal', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const view = game.royal(await load(userOf(request), lifeId));
    if (!view) return reply.code(404).send({ error: 'not royalty' });
    return view;
  });

  app.post('/lives/:lifeId/royal', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { action, choice } = RoyalBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        const result = game.royalAct(state, action as never, choice);
        return {
          life: lifeView(state, game.content),
          royal: game.royal(state),
          line: result.line,
          respectBefore: result.respectBefore,
          respectAfter: result.respectAfter,
        };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/vigilante', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.vigilante(await load(userOf(request), lifeId));
  });

  app.post('/lives/:lifeId/vigilante', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { action, gearId } = VigilanteBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        if (action === 'start') game.startVigilante(state);
        else if (action === 'out') game.goOut(state);
        else if (action === 'gear') game.buyGear(state, gearId ?? '');
        else game.lieLow(state);
        return { life: lifeView(state, game.content), vigilante: game.vigilante(state) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/casino', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.casino(await load(userOf(request), lifeId));
  });

  app.post('/lives/:lifeId/casino', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { game: which, stake, pick } = CasinoBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        const result = game.playCasino(state, which, stake, pick);
        return {
          life: lifeView(state, game.content),
          casino: game.casino(state),
          detail: result.detail,
          line: result.line,
          netLabel: result.netLabel,
          won: result.net > 0,
        };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/blackjack', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.blackjack(await load(userOf(request), lifeId));
  });

  /*
   * One move at the table. The hand lives on the state between these calls,
   * which is the whole point: the dealer's hole card stays face down until the
   * player has finished deciding.
   */
  app.post('/lives/:lifeId/blackjack', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { action, stake } = BlackjackBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        if (action === 'deal') game.dealBlackjack(state, stake ?? 0);
        else if (action === 'hit') game.hitBlackjack(state);
        else if (action === 'stand') game.standBlackjack(state);
        else game.doubleBlackjack(state);
        return { life: lifeView(state, game.content), table: game.blackjack(state) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/blackmarket', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.blackMarket(await load(userOf(request), lifeId));
  });

  app.post('/lives/:lifeId/blackmarket', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const body = BlackMarketBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        const result =
          body.action === 'buy'
            ? game.buyContraband(state, body.dealerId ?? '', body.itemId ?? '')
            : body.action === 'haggle'
              ? game.haggle(state, body.dealerId ?? '')
              : game.fence(state, body.assetId ?? '');
        return {
          life: lifeView(state, game.content),
          market: game.blackMarket(state),
          line: result.line,
        };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/racing', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.racing(await load(userOf(request), lifeId));
  });

  app.post('/lives/:lifeId/racing', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const body = RacingBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        let line = '';
        if (body.action === 'garage') game.buyGarage(state);
        else if (body.action === 'car') game.buyRaceCar(state, body.carId ?? '');
        else if (body.action === 'mod') game.modifyCar(state, body.assetId ?? '', body.modId ?? '');
        else line = game.race(state, body.assetId ?? '', body.style).line;
        return { life: lifeView(state, game.content), racing: game.racing(state), line };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/vampire', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.vampire(await load(userOf(request), lifeId));
  });

  app.post('/lives/:lifeId/vampire', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { action } = VampireBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        const line =
          action === 'turn'
            ? (game.turnVampire(state), 'Somebody came up the stairs.')
            : game.vampireAct(state, action).line;
        return { life: lifeView(state, game.content), vampire: game.vampire(state), line };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/ventures', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return game.ventures(await load(userOf(request), lifeId));
  });

  app.post('/lives/:lifeId/ventures', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const body = VentureBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        let line = '';
        if (body.action === 'start') {
          game.startVenture(state, body.kind as never, body.tierId ?? '');
        } else if (body.action === 'upgrade') {
          game.ventureUpgrade(state, body.ventureId ?? '', body.id ?? '');
        } else {
          line = game.ventureAct(state, body.ventureId ?? '', body.id ?? '').line;
        }
        return { life: lifeView(state, game.content), ...game.ventures(state), line };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/mob', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    return { mob: game.mob(state), eligibility: game.mobEligibility(state) };
  });

  app.post('/lives/:lifeId/mob', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { job } = MobBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        if (job === 'join') {
          game.joinMob(state);
          return {
            life: lifeView(state, game.content),
            mob: game.mob(state),
            line: 'They took you on.',
            cut: null,
          };
        }
        const result = game.doMobJob(state, job as never);
        return {
          life: lifeView(state, game.content),
          mob: game.mob(state),
          line: result.line,
          cut: result.cut,
        };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/escape', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const view = game.escape(await load(userOf(request), lifeId));
    if (!view) return reply.code(404).send({ error: 'no maze' });
    return view;
  });

  app.post('/lives/:lifeId/escape', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { move } = EscapeBody.parse(request.body);
    try {
      return await lives.withLock(userOf(request), lifeId, (state) => {
        if (move === 'start') {
          game.startEscape(state);
          return { life: lifeView(state, game.content), escape: game.escape(state), line: '' };
        }
        const result =
          move === 'surrender' ? game.surrender(state) : game.escapeMove(state, move);
        return {
          life: lifeView(state, game.content),
          escape: game.escape(state),
          line: result.line,
        };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/market', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    return game.market(state, await currentWorld());
  });

  app.post('/lives/:lifeId/trade', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const { stockId, shares, sell } = TradeBody.parse(request.body);
    const userId = userOf(request);
    const world = await currentWorld();
    try {
      return await lives.withLock(userId, lifeId, (state) => {
        if (sell) game.sellShares(state, stockId, shares, world);
        else game.buyShares(state, stockId, shares, world);
        return { life: lifeView(state, game.content), market: game.market(state, world) };
      });
    } catch (error) {
      return reply.code(statusFor(error)).send({ error: messageFor(error) });
    }
  });

  app.get('/lives/:lifeId/prison', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const view = prisonView(await load(userOf(request), lifeId), game.content);
    if (!view) return reply.code(404).send({ error: 'not inside' });
    return view;
  });

  app.get('/lives/:lifeId/more', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    return moreView(await load(userOf(request), lifeId));
  });

  app.get('/lives/:lifeId/legacy', async (request, reply) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    if (!state.legacy) return reply.code(404).send({ error: 'this life is not over' });
    return state.legacy;
  });

  app.get('/lives/:lifeId/history', async (request) => {
    const { lifeId } = request.params as { lifeId: string };
    const state = await load(userOf(request), lifeId);
    return {
      entries: state.history.map((e) => ({ atAge: e.atAge, icon: e.icon, line: e.line })),
    };
  });
};

const statusFor = (error: unknown): number => {
  if (error instanceof ChoiceRejected) return 409;
  if (error instanceof InteractionRejected) return 409;
  if (error instanceof PurchaseRejected) return 409;
  if (error instanceof ApplicationRejected) return 409;
  if (error instanceof AuditionRejected) return 409;
  if (error instanceof RoyalRejected) return 409;
  if (error instanceof MobRejected) return 409;
  if (error instanceof VentureRejected) return 409;
  if (error instanceof CasinoRejected) return 409;
  if (error instanceof MarketRejected) return 409;
  if (error instanceof RacingRejected) return 409;
  if (error instanceof VampireRejected) return 409;
  if (error instanceof VigilanteRejected) return 409;
  if (error instanceof EscapeRejected) return 409;
  if (error instanceof InvariantViolation) return 500;
  const withCode = error as { statusCode?: number; message?: string };
  if (typeof withCode.statusCode === 'number') return withCode.statusCode;
  if (withCode.message?.includes('not found')) return 404;
  if (withCode.message?.includes('open decision') || withCode.message?.includes('dead')) return 409;
  return 400;
};

const messageFor = (error: unknown): string => {
  if (error instanceof InvariantViolation) {
    // Never leak internal invariant detail to a client (§183).
    return 'That could not be completed. Nothing was changed.';
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
};
