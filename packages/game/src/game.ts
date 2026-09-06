import { DEFAULT_CONFIG, type GameConfig } from '@lineage/config';
import { loadContent, type Activity, type ContentPack } from '@lineage/content';
import type {
  CountryPack,
  LifeState,
  Sex,
  Upbringing,
  WorldIndicators,
} from '@lineage/shared-types';
import {
  checkInvariants,
  createLife,
  makeId,
  makeRng,
  refreshDerived,
} from '@lineage/simulation';
import {
  applyEffects,
  resolveChoice,
  type ConditionContext,
  type EffectContext,
} from '@lineage/event-engine';
import { NEUTRAL_INDICATORS } from '@lineage/world';
import { advanceYear, applyDeferred, pushHistory, type AgeUpResult } from './ageup.js';
import { toAncestor } from './death.js';

export interface GameOptions {
  content?: ContentPack;
  config?: GameConfig;
}

export interface NewLifeOptions {
  lifeId?: string;
  seed: string;
  firstName?: string;
  lastName?: string;
  sex?: Sex;
  countryId: string;
  cityId?: string;
  upbringing: Upbringing;
  birthYear?: number;
  /** Present when continuing a family line (design 4C). */
  previousLife?: LifeState;
  heirNpcId?: string | null;
}

export class ChoiceRejected extends Error {}

/**
 * The application service. Everything above this line is presentation or
 * transport; everything below it is pure domain (spec §128).
 */
export class Game {
  readonly content: ContentPack;
  readonly config: GameConfig;

  constructor(options: GameOptions = {}) {
    this.content = options.content ?? loadContent();
    this.config = options.config ?? DEFAULT_CONFIG;
  }

  country(id: string): CountryPack {
    const country = this.content.countriesById.get(id);
    if (!country) throw new Error(`unknown country ${id}`);
    return country;
  }

  newLife(options: NewLifeOptions): LifeState {
    const country = this.country(options.countryId);

    const state = createLife(
      {
        lifeId: options.lifeId ?? makeId('life', options.seed, 'root'),
        seed: options.seed,
        ...(options.firstName ? { firstName: options.firstName } : {}),
        ...(options.lastName ? { lastName: options.lastName } : {}),
        ...(options.sex ? { sex: options.sex } : {}),
        country,
        ...(options.cityId ? { cityId: options.cityId } : {}),
        upbringing: options.upbringing,
        traits: this.content.traits,
        birthYear: options.birthYear ?? new Date().getFullYear(),
        contentVersion: this.content.version,
        ...(options.previousLife ? { lineage: this.carryLineage(options.previousLife) } : {}),
      },
      this.config,
    );

    checkInvariants(state);
    return state;
  }

  /**
   * Design 4C: you continue as somebody who was in the last life. The heir keeps
   * the family's name, its institutions and a share of the estate — and starts at
   * their current age, not at birth.
   */
  succeed(previous: LifeState, heirNpcId: string | null, seed: string): LifeState {
    if (previous.character.alive) throw new Error('the previous life has not ended');

    const heirs = previous.relationships.filter((r) => r.kind === 'child');
    const lineage = this.carryLineage(previous);

    if (heirNpcId === null) {
      // "Somebody new" — a fresh line, but the world keeps going.
      return this.newLife({
        seed,
        countryId: previous.character.countryId,
        upbringing: 'getting_by',
        birthYear: previous.character.birthYear + (previous.character.deathAge ?? 80),
      });
    }

    const heirNpc = previous.npcs.find((n) => n.id === heirNpcId);
    const heirRel = heirs.find((r) => r.npcId === heirNpcId);
    if (!heirNpc || !heirRel) throw new Error(`${heirNpcId} is not an heir of this life`);

    const inheritance = lineage.ancestors[lineage.ancestors.length - 1]?.estatePassedOn ?? 0;
    const deathYear = previous.character.birthYear + (previous.character.deathAge ?? 80);

    const state = this.newLife({
      seed,
      firstName: heirNpc.firstName,
      lastName: heirNpc.lastName,
      sex: heirNpc.sex,
      countryId: previous.character.countryId,
      cityId: heirNpc.cityId,
      upbringing: inheritance > 40_000_000 ? 'comfortable' : 'getting_by',
      birthYear: deathYear - heirNpc.age,
      previousLife: previous,
    });

    // Fast-forward the heir to the age they had actually reached.
    state.character.age = heirNpc.age;
    state.character.avatarEmoji = heirNpc.avatarEmoji;
    if (heirNpc.stats) state.character.stats = { ...heirNpc.stats };
    state.character.finances.savings = inheritance;
    state.lineage = lineage;

    // The estate arrives with everything it was attached to.
    state.assets = previous.assets.map((asset) => ({ ...asset, acquiredAtAge: heirNpc.age }));
    state.businesses = previous.businesses
      .filter((b) => !b.closed)
      .map((b) => ({ ...b, foundedAtAge: Math.max(0, heirNpc.age - (previous.character.age - b.foundedAtAge)) }));

    pushHistory(
      state,
      'family',
      '🕯️',
      `${previous.character.firstName} died at ${previous.character.deathAge}. You are ${heirNpc.firstName}, and it is your turn.`,
      100,
    );

    refreshDerived(state, this.config);
    checkInvariants(state);
    return state;
  }

  private carryLineage(previous: LifeState) {
    const heirCount = previous.relationships.filter((r) => r.kind === 'child').length;
    return {
      ...previous.lineage,
      generation: previous.lineage.generation + 1,
      ancestors: [...previous.lineage.ancestors, toAncestor(previous, heirCount)],
    };
  }

  ageUp(state: LifeState, world: WorldIndicators = NEUTRAL_INDICATORS): AgeUpResult {
    return advanceYear(state, world, this.content, this.config);
  }

  /**
   * Resolving a choice is a transaction: if applying the outcome would break an
   * invariant, nothing is kept (§183).
   */
  choose(
    state: LifeState,
    eventInstanceId: string,
    choiceId: string,
    world: WorldIndicators = NEUTRAL_INDICATORS,
  ): LifeState {
    const instance = state.activeEvent;
    if (!instance || instance.id !== eventInstanceId) {
      throw new ChoiceRejected('that decision is not the one on screen');
    }
    const definition = this.content.eventsById.get(instance.definitionId);
    if (!definition) throw new ChoiceRejected(`event ${instance.definitionId} is no longer published`);

    const before = structuredClone(state);
    const ctx: ConditionContext = { state, world, bindings: instance.participants };

    try {
      const { deferred } = resolveChoice(instance, definition, choiceId, state, ctx, this.config);

      const rng = makeRng(state.seed, 'deferred', instance.id);
      applyDeferred(deferred, state, this.content, this.config, rng, instance.participants);

      state.resolvedEvent = instance;
      state.activeEvent = null;
      state.gameState = 'IDLE';
      refreshDerived(state, this.config);
      checkInvariants(state, before);
      return state;
    } catch (error) {
      // Never leave half-applied state behind.
      Object.assign(state, before);
      throw error;
    }
  }

  /** Design 2C: actions are limited per year, so a year is spent rather than farmed. */
  act(state: LifeState, activityId: string): LifeState {
    const activity = this.content.activities.find((a) => a.id === activityId);
    if (!activity) throw new ChoiceRejected(`unknown activity ${activityId}`);
    if (!state.character.alive) throw new ChoiceRejected('a dead character cannot do anything');
    if (state.activeEvent) throw new ChoiceRejected('answer the open decision first');
    if (activity.costsAction && state.actionsRemaining <= 0) {
      throw new ChoiceRejected('no actions left this year');
    }
    if (state.character.age < activity.minAge || state.character.age > activity.maxAge) {
      throw new ChoiceRejected('not available at this age');
    }
    const liquid = state.character.finances.cash + state.character.finances.savings;
    if (activity.cost > liquid) throw new ChoiceRejected('you cannot afford that');

    const before = structuredClone(state);
    try {
      const rng = makeRng(state.seed, 'activity', activityId, state.character.age, state.step);
      const effectCtx: EffectContext = {
        state,
        config: this.config,
        rng,
        bindings: {},
        deferred: [],
      };

      if (activity.cost > 0) {
        applyEffects([{ op: 'money', delta: -activity.cost }], effectCtx);
      }
      applyEffects(activity.effects as never, effectCtx);
      applyDeferred(effectCtx.deferred, state, this.content, this.config, rng, {});

      if (activity.costsAction) state.actionsRemaining -= 1;
      state.step += 1;
      pushHistory(state, 'random', activity.icon, historyLineFor(activity), 12);

      refreshDerived(state, this.config);
      checkInvariants(state, before);
      return state;
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  }

  /** Dismisses the result card (design 1A "Got it"). */
  dismiss(state: LifeState): LifeState {
    state.resolvedEvent = null;
    state.gameState = state.activeEvent ? 'EVENT_AVAILABLE' : 'IDLE';
    return state;
  }
}

const historyLineFor = (activity: Activity): string => {
  const overrides: Record<string, string> = {
    get_in_shape: 'You got yourself into better shape.',
    see_a_doctor: 'You went and got checked over.',
    take_a_course: 'You took a course.',
    sort_your_head_out: 'You sorted your head out a bit.',
    go_out: 'You went out more than you meant to.',
    travel: 'You went somewhere you had never been.',
    call_your_mom: 'You called your mother.',
    work_harder: 'You put in the hours.',
    study: 'You put the work in at school.',
    party: 'You went out instead of studying.',
  };
  return overrides[activity.id] ?? `${activity.label}.`;
};
