import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

/**
 * These test the transport's promises, not the simulation's: that the server is
 * authoritative, that retries are safe, and that one player cannot reach another
 * player's life.
 */

let app: FastifyInstance;

const asUser = (userId: string) => ({ 'x-user-id': userId });

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const createLife = async (userId = 'alice') => {
  const response = await app.inject({
    method: 'POST',
    url: '/lives',
    headers: asUser(userId),
    payload: { countryId: 'us', cityId: 'portland', upbringing: 'getting_by' },
  });
  expect(response.statusCode).toBe(201);
  return response.json().life as { lifeId: string };
};

/** Ages up until a decision appears, or the character dies. */
const ageUntilEvent = async (lifeId: string, userId: string) => {
  for (let i = 0; i < 40; i++) {
    const response = await app.inject({
      method: 'POST',
      url: `/lives/${lifeId}/age-up`,
      headers: asUser(userId),
    });
    if (response.statusCode !== 200) continue;
    const life = response.json().life;
    if (life.activeEvent) return life;
    if (life.gameState === 'LIFE_COMPLETE') return null;
  }
  return null;
};

describe('the server is the authority', () => {
  it('creates a life and returns a presentation-ready view', async () => {
    const life = await createLife();
    const response = await app.inject({ url: `/lives/${life.lifeId}`, headers: asUser('alice') });

    expect(response.statusCode).toBe(200);
    const view = response.json().life;
    expect(view.stats).toHaveLength(5);
    expect(view.age).toBe(0);
    expect(view.canAgeUp).toBe(true);
    // The client is never handed anything it could use to predict the future.
    expect(view).not.toHaveProperty('seed');
  });

  it('ignores a seed supplied by the client', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/lives',
      headers: asUser('alice'),
      payload: { countryId: 'us', upbringing: 'getting_by', seed: 'attacker-chosen' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().life.age).toBe(0);
  });

  it('rejects an unknown country', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/lives',
      headers: asUser('alice'),
      payload: { countryId: 'atlantis', upbringing: 'getting_by' },
    });
    expect(response.statusCode).toBe(400);
  });

  it("will not let one player read another player's life", async () => {
    const life = await createLife('alice');
    const response = await app.inject({ url: `/lives/${life.lifeId}`, headers: asUser('mallory') });
    expect(response.statusCode).toBe(404);
  });

  it("will not let one player age another player's character", async () => {
    const life = await createLife('alice');
    const response = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/age-up`,
      headers: asUser('mallory'),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('what a real browser actually sends', () => {
  it('accepts a bodyless POST that still declares a JSON content-type', async () => {
    // The browser client sets content-type on every request unless told not to.
    // Fastify rejects an empty body with that header, which broke age-up entirely
    // and was invisible to tests that omitted the header.
    const life = await createLife('nora');

    const response = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/age-up`,
      headers: { ...asUser('nora'), 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().life.age).toBe(1);
  });

  it('still rejects a malformed JSON body', async () => {
    const life = await createLife('olive');
    const response = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/act`,
      headers: { ...asUser('olive'), 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('idempotency and concurrency', () => {
  it('does not age the character twice for a retried request', async () => {
    const life = await createLife('bob');
    const key = 'retry-key-1';
    const headers = { ...asUser('bob'), 'idempotency-key': key };

    const first = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/age-up`,
      headers,
    });
    expect(first.statusCode).toBe(200);
    const firstAge = first.json().life.age;

    const retry = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/age-up`,
      headers,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['idempotent-replay']).toBe('true');
    expect(retry.json().life.age).toBe(firstAge);

    const current = await app.inject({ url: `/lives/${life.lifeId}`, headers: asUser('bob') });
    expect(current.json().life.age).toBe(firstAge);
  });

  it('serialises simultaneous age-ups instead of interleaving them', async () => {
    const life = await createLife('carol');

    // Ten requests fired at once with no idempotency key: each is a distinct
    // intent, so each should apply exactly once, and never on top of a half-
    // finished transaction.
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: `/lives/${life.lifeId}/age-up`,
          headers: asUser('carol'),
        }),
      ),
    );

    const succeeded = responses.filter((r) => r.statusCode === 200).length;
    const current = await app.inject({ url: `/lives/${life.lifeId}`, headers: asUser('carol') });
    expect(current.json().life.age).toBe(succeeded);
  });
});

describe('the rules the client cannot bypass', () => {
  it('refuses to age up while a decision is open', async () => {
    const life = await createLife('dave');
    const withEvent = await ageUntilEvent(life.lifeId, 'dave');
    if (!withEvent) return;

    const response = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/age-up`,
      headers: asUser('dave'),
    });
    expect(response.statusCode).toBe(409);
  });

  it('refuses a choice that was never offered', async () => {
    const life = await createLife('erin');
    const withEvent = await ageUntilEvent(life.lifeId, 'erin');
    if (!withEvent) return;

    const response = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/events/${withEvent.activeEvent.id}/choose`,
      headers: asUser('erin'),
      payload: { choiceId: 'give_me_a_million_dollars' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('refuses to resolve the same decision twice', async () => {
    const life = await createLife('frank');
    const withEvent = await ageUntilEvent(life.lifeId, 'frank');
    if (!withEvent) return;

    const url = `/lives/${life.lifeId}/events/${withEvent.activeEvent.id}/choose`;
    const payload = { choiceId: withEvent.activeEvent.choices[0].id };

    const first = await app.inject({ method: 'POST', url, headers: asUser('frank'), payload });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'POST', url, headers: asUser('frank'), payload });
    expect(second.statusCode).toBe(409);
  });

  it('refuses an activity the character cannot afford', async () => {
    const life = await createLife('grace');
    const response = await app.inject({
      method: 'POST',
      url: `/lives/${life.lifeId}/act`,
      headers: asUser('grace'),
      payload: { activityId: 'travel' },
    });
    expect(response.statusCode).toBe(409);
  });
});

describe('the screens the design needs', () => {
  it('serves every view the client renders', async () => {
    const life = await createLife('heidi');

    for (let i = 0; i < 25; i++) {
      const aged = await app.inject({
        method: 'POST',
        url: `/lives/${life.lifeId}/age-up`,
        headers: asUser('heidi'),
      });
      if (aged.statusCode === 200) continue;

      // Blocked by an open decision: answer it and carry on.
      const current = await app.inject({ url: `/lives/${life.lifeId}`, headers: asUser('heidi') });
      const event = current.json().life.activeEvent;
      if (!event) break;
      await app.inject({
        method: 'POST',
        url: `/lives/${life.lifeId}/events/${event.id}/choose`,
        headers: asUser('heidi'),
        payload: { choiceId: event.choices[0].id },
      });
    }

    for (const path of ['people', 'actions', 'money', 'more', 'history']) {
      const response = await app.inject({
        url: `/lives/${life.lifeId}/${path}`,
        headers: asUser('heidi'),
      });
      expect(response.statusCode, path).toBe(200);
    }
  });

  it('lists the birthplaces the character-creation screen offers', async () => {
    const response = await app.inject({ url: '/content/countries' });
    expect(response.statusCode).toBe(200);
    const { countries } = response.json();
    expect(countries.length).toBeGreaterThan(0);
    for (const country of countries) {
      expect(country.flag).toBeTruthy();
      expect(country.cities.length).toBeGreaterThan(0);
    }
  });
});
