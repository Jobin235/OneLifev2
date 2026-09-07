import { Game, actionsView, lifeView, moneyView, moreView, peopleView, personView, schoolView, workView } from '@lineage/game';
import { SCHEMA_VERSION, type LifeState } from '@lineage/shared-types';
import { NEUTRAL_INDICATORS, snapshot, tickWorld } from '@lineage/world';
import { DEFAULT_CONFIG } from '@lineage/config';
import { localContent } from './localContent';
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
}

const EMPTY: Stored = { lives: {}, order: [] };

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
      const result = game.ageUp(get(lifeId), indicators);
      save(result.state);
      return { ...view(result.state), recap: result.recap, died: result.died };
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
