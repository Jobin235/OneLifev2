import { Game, actionsView, lifeView, moneyView, moreView, peopleView, personView } from '@lineage/game';
import type { LifeState } from '@lineage/shared-types';
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

const read = (): Stored => {
  const raw = safeStorage.get(STORAGE_KEY);
  if (!raw) return { lives: {}, order: [] };
  try {
    return JSON.parse(raw) as Stored;
  } catch {
    // Corrupt save: start fresh rather than refusing to load.
    return { lives: {}, order: [] };
  }
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

    choose: async (lifeId, eventId, choiceId) => {
      const state = game.choose(get(lifeId), eventId, choiceId, indicators);
      save(state);
      return view(state);
    },

    dismiss: async (lifeId) => {
      const state = game.dismiss(get(lifeId));
      save(state);
      return view(state);
    },

    act: async (lifeId, activityId) => {
      const state = game.act(get(lifeId), activityId);
      save(state);
      return view(state);
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
      const person = personView(get(lifeId), npcId, game.config);
      if (!person) throw new Error('no such person in this life');
      return person as never;
    },
    actions: async (lifeId) => {
      const state = get(lifeId);
      return { actions: actionsView(state, game.content) as never, remaining: state.actionsRemaining };
    },
    money: async (lifeId) => moneyView(get(lifeId), game.config) as never,
    more: async (lifeId) => moreView(get(lifeId)) as never,
    legacy: async (lifeId) => {
      const legacy = get(lifeId).legacy;
      if (!legacy) throw new Error('this life is not over');
      return legacy as never;
    },
  };
};
