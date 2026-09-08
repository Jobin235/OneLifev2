import { describe, expect, it } from 'vitest';
import { InteractionRejected, warmthOf } from '../interact.js';
import { createGame } from '../node.js';

/**
 * The NPC model was always deeper than a single relationship bar; these assert
 * that the depth is actually reachable and that it actually matters.
 */
describe('doing something to a specific person', () => {
  const game = createGame();

  const adultWithPeople = (seed: string) => {
    let state = game.newLife({ countryId: 'us', upbringing: 'getting_by', seed });
    while (state.character.alive && state.character.age < 26) {
      if (state.activeEvent) {
        state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
        continue;
      }
      state = game.ageUp(state).state;
    }
    // Leave no decision open: an open one blocks every interaction, which is
    // correct behaviour but not what these tests are about.
    while (state.activeEvent) {
      state = game.choose(state, state.activeEvent.id, state.activeEvent.choices[0]!.id);
    }
    return state;
  };

  /** Someone still alive to act on — relationships[0] may have died. */
  const someone = (state: ReturnType<typeof adultWithPeople>) => {
    const alive = new Set(state.npcs.filter((n) => n.alive).map((n) => n.id));
    const rel = state.relationships.find((r) => alive.has(r.npcId));
    if (!rel) throw new Error('nobody left alive in this life');
    return rel;
  };

  it('offers something to do with everyone you know', () => {
    const state = adultWithPeople('int-1');
    expect(state.relationships.length).toBeGreaterThan(0);
    for (const rel of state.relationships) {
      expect(game.interactions(state, rel.npcId).length).toBeGreaterThan(0);
    }
  });

  it('writes what happened into that person\'s memory', () => {
    const state = adultWithPeople('int-2');
    const rel = someone(state);
    const before = rel.memories.length;

    const { state: after, line } = game.interact(state, rel.npcId, 'talk');
    const relAfter = after.relationships.find((r) => r.npcId === rel.npcId)!;

    expect(relAfter.memories.length).toBe(before + 1);
    expect(relAfter.memories.at(-1)!.line).toBe(line);
    // The memory names the person rather than leaving a token behind.
    expect(line).not.toContain('{them}');
  });

  it('lands differently depending on how the relationship already stands', () => {
    const state = adultWithPeople('int-3');
    const rel = someone(state);

    // Two versions of the same person: one trusted, one not.
    const warmState = structuredClone(state);
    const warmRel = warmState.relationships.find((r) => r.npcId === rel.npcId)!;
    Object.assign(warmRel.dimensions, {
      affection: 95, trust: 95, closeness: 95, respect: 95, conflict: 0,
    });

    const coldState = structuredClone(state);
    const coldRel = coldState.relationships.find((r) => r.npcId === rel.npcId)!;
    Object.assign(coldRel.dimensions, {
      affection: 5, trust: 5, closeness: 5, respect: 5, conflict: 80,
    });

    expect(warmthOf(warmRel)).toBeGreaterThan(warmthOf(coldRel) + 50);

    // Across many draws the warm relationship should go well far more often.
    const goesWell = (base: typeof state) => {
      let warm = 0;
      for (let i = 0; i < 40; i++) {
        const attempt = structuredClone(base);
        attempt.seed = `${base.seed}:${i}`;
        if (game.interact(attempt, rel.npcId, 'talk').warm) warm++;
      }
      return warm;
    };

    expect(goesWell(warmState)).toBeGreaterThan(goesWell(coldState));
  });

  it('refuses what the relationship has not earned', () => {
    const state = adultWithPeople('int-4');
    const rel = someone(state);
    Object.assign(rel.dimensions, {
      affection: 2, trust: 2, closeness: 2, respect: 2, conflict: 90,
    });

    // Confiding needs warmth of 45; this relationship is nowhere near it.
    expect(() => game.interact(state, rel.npcId, 'confide')).toThrow(InteractionRejected);
    const card = game.interactions(state, rel.npcId).find((i) => i.id === 'confide')!;
    expect(card.available).toBe(false);
    expect(card.blockedReason).toBe('You are not close enough for that');
  });

  it('only offers what makes sense for the relationship', () => {
    const state = adultWithPeople('int-5');
    const parent = state.relationships.find((r) => r.kind === 'mother' || r.kind === 'father');
    if (!parent) return;

    const ids = game.interactions(state, parent.npcId).map((i) => i.id);
    // You cannot ask out or disown a parent.
    expect(ids).not.toContain('ask_out');
    expect(ids).not.toContain('cut_off');
    expect(ids).toContain('talk');
  });

  it('hands back the bar it moved, so the result can be seen and not only read', () => {
    /*
     * The result used to be a sentence over meters the toast was covering,
     * which gave the player no way to tell whether the tap had bought anything.
     */
    const state = adultWithPeople('int-meter');
    const rel = someone(state);
    const before = { ...rel.dimensions };

    const result = game.interact(state, rel.npcId, 'talk');
    expect(result.meter).not.toBeNull();
    const meter = result.meter!;

    // Named for the person, not for the data model.
    expect(meter.label).toMatch(/^\S+'s /);
    expect(meter.label).not.toMatch(/dimension|affection: /i);

    // It reports the dimension that actually moved furthest.
    const after = result.state.relationships.find((r) => r.npcId === rel.npcId)!.dimensions;
    const moves = (Object.keys(after) as (keyof typeof after)[]).map((key) =>
      Math.abs(after[key] - before[key]),
    );
    expect(meter.to - meter.from).not.toBe(0);
    expect(Math.abs(meter.to - meter.from)).toBe(Math.max(...moves));
    expect(meter.to).toBeGreaterThanOrEqual(0);
    expect(meter.to).toBeLessThanOrEqual(100);
  });

  it('never calls an argument good news', () => {
    /*
     * Colouring by direction alone congratulated the player for a row: friction
     * is the one dimension where up is worse, and "Lila's friction +2" was
     * being drawn in the same green as an afternoon that went well.
     */
    let sawFriction = 0;
    for (let i = 0; i < 30; i++) {
      const state = adultWithPeople(`int-polarity-${i}`);
      const rel = someone(state);
      for (const id of ['talk', 'insult', 'compliment']) {
        const card = game.interactions(state, rel.npcId).find((c) => c.id === id);
        if (!card?.available) continue;
        const { meter } = game.interact(state, rel.npcId, id);
        if (!meter || !/friction/i.test(meter.label)) continue;
        sawFriction += 1;
        expect(meter.good).toBe(meter.to < meter.from);
      }
    }
    expect(sawFriction).toBeGreaterThan(0);
  });

  it('makes an afternoon and a gift a choice, not a tap', () => {
    /*
     * "Spend time with her" and "Give her a gift" are categories. Resolving
     * either in one tap throws away the only decision in them — which
     * afternoon, and how much you spent, is the whole of the gesture.
     */
    const state = adultWithPeople('int-opt');
    const rel = someone(state);
    const cards = game.interactions(state, rel.npcId);

    for (const id of ['spend_time', 'gift']) {
      const card = cards.find((c) => c.id === id);
      if (!card) continue;
      expect(card.options.length).toBeGreaterThan(1);
      // Free things and expensive things, so the price is a signal.
      expect(card.options.some((o) => o.cost === 0 || o.cost < 5_000)).toBe(true);
      expect(card.options.some((o) => o.cost > 50_000)).toBe(true);
      // And the row itself does nothing.
      expect(() => game.interact(state, rel.npcId, id)).toThrow(/choose what/);
    }
  });

  it('charges what the option costs, not what the row costs', () => {
    const state = adultWithPeople('int-price');
    state.character.finances.savings = 1_000_000_00;
    state.character.finances.cash = 0;
    const rel = someone(state);
    const card = game.interactions(state, rel.npcId).find((c) => c.id === 'gift');
    if (!card) return;

    const flowers = card.options.find((o) => o.id === 'flowers')!;
    const before = state.character.finances.cash + state.character.finances.savings;
    const after = game.interact(state, rel.npcId, 'gift', 'flowers').state;
    const spent = before - (after.character.finances.cash + after.character.finances.savings);
    expect(spent).toBe(flowers.cost);
  });

  it('does not let money stand in for affection', () => {
    /*
     * Buying a car for somebody barely in your life reads as buying *them*,
     * and lands worse than flowers would have. Without this the gift list is a
     * slider where richer is kinder, and there is only ever one right answer.
     */
    let coldWent = 0;
    let warmWent = 0;

    for (let i = 0; i < 24; i++) {
      for (const warmth of ['cold', 'warm'] as const) {
        const state = adultWithPeople(`int-lavish-${i}`);
        if (!state.character.alive || state.character.record.incarceration) continue;
        state.character.finances.savings = 100_000_000_00;
        const rel = someone(state);
        for (const key of ['affection', 'trust', 'closeness', 'respect'] as const) {
          rel.dimensions[key] = warmth === 'warm' ? 92 : 30;
        }
        rel.dimensions.conflict = 0;

        const card = game.interactions(state, rel.npcId).find((c) => c.id === 'gift');
        const car = card?.options.find((o) => o.id === 'car');
        if (!car) continue;

        const result = game.interact(state, rel.npcId, 'gift', 'car');
        if (result.warm) {
          if (warmth === 'warm') warmWent += 1;
          else coldWent += 1;
        }
      }
    }

    expect(warmWent).toBeGreaterThan(coldWent * 2);
  });

  it('limits each interaction per year, per person', () => {
    const state = adultWithPeople('int-6');
    const rel = someone(state);

    let current = state;
    for (let i = 0; i < 3; i++) current = game.interact(current, rel.npcId, 'talk').state;
    expect(() => game.interact(current, rel.npcId, 'talk')).toThrow(/Not again this year/);

    // A different person is unaffected — the limit is per relationship.
    const other = current.relationships.find(
      (r) => r.npcId !== rel.npcId && current.npcs.some((n) => n.id === r.npcId && n.alive),
    );
    if (other) expect(() => game.interact(current, other.npcId, 'talk')).not.toThrow();
  });
});
