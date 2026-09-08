import { Game, actionsView, lifeView, moneyView, moreView, peopleView, personView, schoolView, workView } from '@lineage/game';
import { SCHEMA_VERSION, type LifeState } from '@lineage/shared-types';
import { NEUTRAL_INDICATORS, snapshot, tickWorld } from '@lineage/world';
import { DEFAULT_CONFIG } from '@lineage/config';
import { localContent } from './localContent';
import { forget, remember, rewind, rewindOptions, type Snapshot } from '@lineage/game';
import { safeStorage } from './storage';
import type { Api } from './api';

/**
 * Runs the whole simulation in the browser, behind the same interface the real
 * API client implements.
 *
 * The trade-off is deliberate and worth being clear about: this build is not
 * server-authoritative, so nothing here resists a determined player with dev
 * tools open. It exists to let someone play the game without installing
 * anything. The production path is `api.ts`, and both are the same engine.
 */
const STORAGE_KEY = 'onelife.localLives';

interface Stored {
  lives: Record<string, LifeState>;
  order: string[];
  /**
   * The last eight years of each life, kept beside the save rather than inside
   * it: a LifeState containing eight LifeStates is a schema that cannot describe
   * itself, and a save carrying its own history is nine times the size.
   */
  history?: Record<string, Snapshot[]>;
}

const EMPTY: Stored = { lives: {}, order: [], history: {} };

const read = (): Stored => {
  const raw = safeStorage.get(STORAGE_KEY);
  if (!raw) return EMPTY;

  let parsed: Stored;
  try {
    parsed = JSON.parse(raw) as Stored;
  } catch {
    // Corrupt save: start fresh rather than refusing to load.
    return EMPTY;
  }

  /*
   * There is no migration path yet, so a life saved by an older build is
   * dropped rather than loaded into an engine that expects a different shape.
   * Losing a demo save is a nuisance; loading one and failing an invariant
   * three age-ups later is much worse to debug.
   */
  const compatible = Object.values(parsed.lives ?? {}).every(
    (life) => life?.schemaVersion === SCHEMA_VERSION,
  );
  if (!compatible) {
    safeStorage.remove(STORAGE_KEY);
    return EMPTY;
  }
  return parsed;
};

const write = (store: Stored): void => safeStorage.set(STORAGE_KEY, JSON.stringify(store));

export const createLocalApi = (): Api => {
  const game = new Game({ content: localContent() });
  const store = read();

  // A world that has already been running a while, so indicators are not all 100.
  let indicators = NEUTRAL_INDICATORS;
  let seed = 20260101;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let tick = 0; tick < 400; tick++) {
    indicators = tickWorld({
      indicators,
      activeEvents: [],
      tick,
      config: DEFAULT_CONFIG,
      random,
    }).indicators;
  }
  void snapshot('local', 400, indicators, []);

  const get = (lifeId: string): LifeState => {
    const state = store.lives[lifeId];
    if (!state) throw new Error('life not found');
    return state;
  };

  const save = (state: LifeState) => {
    store.lives[state.id] = state;
    if (!store.order.includes(state.id)) store.order.push(state.id);
    write(store);
  };

  const view = (state: LifeState) => ({ life: lifeView(state, game.content) as never });

  return {
    countries: async () => ({
      countries: game.content.countries.map((c) => ({
        id: c.id,
        name: c.name,
        flag: c.flag,
        region: c.region,
        changes: c.changes,
        cities: c.cities.map((city) => ({ id: city.id, name: city.name, blurb: city.blurb })),
      })),
    }),

    listLives: async () => ({
      lives: store.order
        .map((id) => store.lives[id])
        .filter((s): s is LifeState => !!s)
        .map((s) => ({
          id: s.id,
          name: `${s.character.firstName} ${s.character.lastName}`,
          age: s.character.age,
          alive: s.character.alive,
        })),
    }),

    newLife: async (body) => {
      const state = game.newLife({
        ...body,
        seed: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      });
      save(state);
      return view(state);
    },

    life: async (lifeId) => view(get(lifeId)),

    ageUp: async (lifeId) => {
      const before = get(lifeId);
      // Taken before the year runs, so rewinding to it un-lives that year.
      store.history = store.history ?? {};
      store.history[lifeId] = remember(store.history[lifeId] ?? [], before);

      const result = game.ageUp(before, indicators);
      save(result.state);
      return { ...view(result.state), recap: result.recap, died: result.died };
    },

    rewindOptions: async (lifeId) => rewindOptions(store.history?.[lifeId] ?? [], get(lifeId)),

    rewind: async (lifeId, toAge) => {
      const history = store.history?.[lifeId] ?? [];
      const restored = rewind(history, get(lifeId), toAge);
      store.history = store.history ?? {};
      store.history[lifeId] = forget(history, toAge);
      save(restored);
      /*
       * A LifeView, not the `{ life }` envelope the other methods return — the
       * HTTP client unwraps that before it reaches the app, so this has to hand
       * back the same thing. An `as never` here hid exactly this for one build.
       */
      return lifeView(restored, game.content) as never;
    },

    choose: async (lifeId, eventId, choiceId, selections) => {
      const state = game.choose(get(lifeId), eventId, choiceId, selections ?? {}, indicators);
      save(state);
      return view(state);
    },

    dismiss: async (lifeId) => {
      const state = game.dismiss(get(lifeId));
      save(state);
      return view(state);
    },

    act: async (lifeId, activityId) => {
      const { state, outcome } = game.act(get(lifeId), activityId);
      save(state);
      return { ...view(state), outcome };
    },

    succeed: async (lifeId, heirNpcId) => {
      const next = game.succeed(
        get(lifeId),
        heirNpcId,
        `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      );
      save(next);
      return view(next);
    },

    people: async (lifeId) => peopleView(get(lifeId)) as never,
    person: async (lifeId, npcId) => {
      const person = personView(get(lifeId), npcId, game.config, game.content);
      if (!person) throw new Error('no such person in this life');
      return person as never;
    },
    interact: async (lifeId, npcId, interactionId) => {
      const { state, warm, line } = game.interact(get(lifeId), npcId, interactionId);
      save(state);
      return {
        ...view(state),
        person: personView(state, npcId, game.config, game.content) as never,
        warm,
        line,
      };
    },

    prison: async (lifeId) => game.prison(get(lifeId)) as never,

    market: async (lifeId) => game.market(get(lifeId), indicators) as never,

    fame: async (lifeId) => game.fame(get(lifeId)) as never,

    royal: async (lifeId) => game.royal(get(lifeId)) as never,

    mob: async (lifeId) => {
      const state = get(lifeId);
      return { mob: game.mob(state), eligibility: game.mobEligibility(state) } as never;
    },

    mobAct: async (lifeId, job) => {
      const state = get(lifeId);
      if (job === 'join') {
        const joined = game.joinMob(state);
        save(joined);
        return {
          life: lifeView(joined, game.content) as never,
          mob: game.mob(joined) as never,
          line: '',
          cut: null,
        };
      }
      const result = game.doMobJob(state, job as never);
      save(result.state);
      return {
        life: lifeView(result.state, game.content) as never,
        mob: game.mob(result.state) as never,
        line: result.line,
        cut: result.cut,
      };
    },

    casino: async (lifeId) => game.casino(get(lifeId)) as never,

    bet: async (lifeId, which, stake, pick) => {
      const result = game.playCasino(get(lifeId), which as never, stake, pick);
      save(result.state);
      return {
        life: lifeView(result.state, game.content) as never,
        casino: game.casino(result.state) as never,
        detail: result.detail,
        line: result.line,
        netLabel: result.netLabel,
        won: result.net > 0,
      } as never;
    },

    blackMarket: async (lifeId) => game.blackMarket(get(lifeId)) as never,

    deal: async (lifeId, body) => {
      const state = get(lifeId);
      const result =
        body.action === 'buy'
          ? game.buyContraband(state, body.dealerId ?? '', body.itemId ?? '')
          : body.action === 'haggle'
            ? game.haggle(state, body.dealerId ?? '')
            : game.fence(state, body.assetId ?? '');
      save(result.state);
      return {
        life: lifeView(result.state, game.content) as never,
        market: game.blackMarket(result.state) as never,
        line: result.line,
      } as never;
    },

    racing: async (lifeId) => game.racing(get(lifeId)) as never,

    racingAct: async (lifeId, body) => {
      const state = get(lifeId);
      let line = '';
      if (body.action === 'garage') game.buyGarage(state);
      else if (body.action === 'car') game.buyRaceCar(state, body.carId ?? '');
      else if (body.action === 'mod') game.modifyCar(state, body.assetId ?? '', body.modId ?? '');
      else line = game.race(state, body.assetId ?? '', (body.style ?? 'steady') as never).line;
      save(state);
      return {
        life: lifeView(state, game.content) as never,
        racing: game.racing(state) as never,
        line,
      } as never;
    },

    vampire: async (lifeId) => game.vampire(get(lifeId)) as never,

    vampireAct: async (lifeId, action) => {
      const state = get(lifeId);
      let line = '';
      if (action === 'turn') {
        game.turnVampire(state);
        line = 'Somebody came up the stairs.';
      } else {
        line = game.vampireAct(state, action as never).line;
      }
      save(state);
      return {
        life: lifeView(state, game.content) as never,
        vampire: game.vampire(state) as never,
        line,
      } as never;
    },

    ventures: async (lifeId) => game.ventures(get(lifeId)) as never,

    venture: async (lifeId, body) => {
      const state = get(lifeId);
      let line = '';
      if (body.action === 'start') {
        game.startVenture(state, body.kind as never, body.tierId ?? '');
      } else if (body.action === 'upgrade') {
        game.ventureUpgrade(state, body.ventureId ?? '', body.id ?? '');
      } else {
        line = game.ventureAct(state, body.ventureId ?? '', body.id ?? '').line;
      }
      save(state);
      const view = game.ventures(state);
      return {
        life: lifeView(state, game.content) as never,
        ventures: view.ventures as never,
        offers: view.offers as never,
        line,
      };
    },

    escapeState: async (lifeId) => game.escape(get(lifeId)) as never,

    escapeMove: async (lifeId, move) => {
      const state = get(lifeId);
      if (move === 'start') {
        const started = game.startEscape(state);
        save(started);
        return {
          life: lifeView(started, game.content) as never,
          escape: game.escape(started) as never,
          line: '',
        };
      }
      const result =
        move === 'surrender' ? game.surrender(state) : game.escapeMove(state, move as never);
      save(result.state);
      return {
        life: lifeView(result.state, game.content) as never,
        escape: game.escape(result.state) as never,
        line: result.line,
      };
    },

    royalAct: async (lifeId, action, choice) => {
      const result = game.royalAct(get(lifeId), action as never, choice);
      save(result.state);
      return {
        life: lifeView(result.state, game.content) as never,
        royal: game.royal(result.state) as never,
        line: result.line,
        respectAfter: result.respectAfter,
      };
    },

    audition: async (lifeId, trackId) => {
      const state = game.audition(get(lifeId), trackId);
      save(state);
      return { life: lifeView(state, game.content) as never };
    },

    properties: async (lifeId) => game.properties(get(lifeId)) as never,

    amenities: async (lifeId, assetId) => game.amenities(get(lifeId), assetId) as never,

    manageProperty: async (lifeId, assetId, action, amenityId) => {
      const state = game.manageProperty(get(lifeId), assetId, action, amenityId);
      save(state);
      return {
        life: lifeView(state, game.content) as never,
        properties: game.properties(state) as never,
      };
    },

    trade: async (lifeId, stockId, shares, sell) => {
      const state = sell
        ? game.sellShares(get(lifeId), stockId, shares, indicators)
        : game.buyShares(get(lifeId), stockId, shares, indicators);
      save(state);
      return {
        life: lifeView(state, game.content) as never,
        market: game.market(state, indicators) as never,
      };
    },
    school: async (lifeId) => schoolView(get(lifeId), game.content) as never,
    work: async (lifeId) => workView(get(lifeId), game.content) as never,

    openings: async (lifeId) => {
      const state = get(lifeId);
      return {
        openings: game.openings(state) as never,
        applicationsLeft: Math.max(0, 3 - (state.applicationsThisYear ?? 0)),
      };
    },

    applyFor: async (lifeId, trackId) => {
      const { state, hired, line } = game.applyFor(get(lifeId), trackId);
      save(state);
      return { ...view(state), hired, line };
    },

    actions: async (lifeId) => ({ actions: actionsView(get(lifeId), game.content) as never }),
    money: async (lifeId) => moneyView(get(lifeId), game.config, game.content) as never,
    buy: async (lifeId, purchasableId, onFinance) => {
      const state = game.buy(get(lifeId), purchasableId, onFinance === true);
      save(state);
      return { ...view(state), money: moneyView(state, game.config, game.content) as never };
    },

    sell: async (lifeId, assetId) => {
      const state = game.sell(get(lifeId), assetId);
      save(state);
      return { ...view(state), money: moneyView(state, game.config, game.content) as never };
    },

    more: async (lifeId) => moreView(get(lifeId)) as never,
    legacy: async (lifeId) => {
      const legacy = get(lifeId).legacy;
      if (!legacy) throw new Error('this life is not over');
      return legacy as never;
    },
  };
};
