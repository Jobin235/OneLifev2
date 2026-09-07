import { interact, interactionsFor } from './interact.js';
import { buy, sell, shopView } from './shop.js';
import { actionsView, schoolView, workView } from './views.js';
import { DEFAULT_CONFIG, type GameConfig } from '@lineage/config';
import type { Activity, ContentPack } from '@lineage/content';
import type {
  CountryPack,
  LifeState,
  Sex,
  Upbringing,
  WorldIndicators,
} from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import {
  checkInvariants,
  createLife,
  makeId,
  makeRng,
  refreshDerived,
  type Rng,
} from '@lineage/simulation';
import {
  InvalidChoiceError,
  applyEffects,
  resolveChoice,
  type ConditionContext,
  type EffectContext,
} from '@lineage/event-engine';
import { NEUTRAL_INDICATORS } from '@lineage/world';
import { advanceYear, applyDeferred, pushHistory, type AgeUpResult } from './ageup.js';
import { toAncestor } from './death.js';

export interface GameOptions {
  /**
   * Required. The composition root does not reach for a filesystem — the server
   * reads content from disk and hands it in, the client bundles it and hands it
   * in. That is what lets the same engine run in both places.
   */
  content: ContentPack;
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
 * What an activity actually did. `no_further_effect` is a successful request
 * that deliberately changed nothing.
 */
export type ActOutcome = 'done' | 'overdone' | 'no_further_effect' | 'backfired';

export interface ActResult {
  state: LifeState;
  outcome: ActOutcome;
}

/**
 * The application service. Everything above this line is presentation or
 * transport; everything below it is pure domain (spec §128).
 */
/**
 * The composition root.
 *
 * Every method here **mutates the state it is given** and returns that same
 * reference; none of them clone. That keeps age-up cheap on a large life and
 * matches how the simulation packages work internally, but it means a caller
 * holding a "before" reference is holding the "after" one too. Snapshot the
 * values you need, or `structuredClone` first.
 *
 * On a thrown error the state is rolled back to where it started, so a rejected
 * action never leaves a half-applied life behind.
 */
export class Game {
  readonly content: ContentPack;
  readonly config: GameConfig;

  constructor(options: GameOptions) {
    this.content = options.content;
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
      const fresh = this.newLife({
        seed,
        countryId: previous.character.countryId,
        upbringing: 'getting_by',
        birthYear: previous.character.birthYear + (previous.character.deathAge ?? 80),
      });
      // The ribbons are the player's collection, not the character's, so they
      // survive even a completely unrelated next life.
      fresh.ribbonsEarned = [...previous.ribbonsEarned];
      return fresh;
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
    state.ribbonsEarned = [...previous.ribbonsEarned];

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
      // The application layer speaks one rejection type, so transports above it
      // do not need to know that the event engine has its own.
      if (error instanceof InvalidChoiceError) throw new ChoiceRejected(error.message);
      throw error;
    }
  }

  /**
   * Does something with a year.
   *
   * There is no action budget. The player may tap anything as often as they
   * like; what stops a year being farmed is that each activity stops helping
   * after a few goes, and a few of them start hurting instead.
   *
   * Tapping something that has stopped helping is a no-op, not an error — it
   * costs nothing and changes nothing. Charging for an effect the player will
   * not get would be a trap, and rejecting the tap would make the client
   * responsible for a rule the server owns.
   */
  act(state: LifeState, activityId: string): ActResult {
    const activity = this.content.activities.find((a) => a.id === activityId);
    if (!activity) throw new ChoiceRejected(`unknown activity ${activityId}`);
    if (!state.character.alive) throw new ChoiceRejected('a dead character cannot do anything');
    if (state.activeEvent) throw new ChoiceRejected('answer the open decision first');
    if (state.character.age < activity.minAge || state.character.age > activity.maxAge) {
      throw new ChoiceRejected('not available at this age');
    }

    const used = state.activityUsage[activityId] ?? 0;
    const spent = activity.effectiveTimes > 0 && used >= activity.effectiveTimes;

    // Nothing left to gain, and nothing to lose: a free no-op.
    if (spent && activity.onRepeat === 'no_effect') {
      return { state, outcome: 'no_further_effect' };
    }

    const before = structuredClone(state);
    const rng = makeRng(state.seed, 'activity', activityId, state.character.age, used);

    try {
      if (spent) {
        /*
         * Past the point of usefulness, the benefit is gone and only the cost of
         * overdoing it remains — the fifth training session of the year is an
         * injury, not a personal best. Applying the gains *and* the harm would
         * net out positive and quietly reward spamming, which is the exact
         * behaviour this is here to discourage.
         */
        overdoIt(state, used - activity.effectiveTimes + 1, rng);
        state.activityUsage[activityId] = used + 1;
        state.step += 1;
        pushHistory(state, 'random', activity.icon, overdoneLineFor(activity), 8);
        refreshDerived(state, this.config);
        checkInvariants(state, before);
        return { state, outcome: 'overdone' };
      }

      const liquid = state.character.finances.cash + state.character.finances.savings;
      if (activity.cost > liquid) throw new ChoiceRejected('you cannot afford that');

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

      /*
       * Risky things roll before they resolve. On a backfire the ordinary
       * effects do not apply at all — getting caught cheating is a different
       * outcome, not a smaller version of cheating successfully.
       */
      const backfired = activity.backfire !== null && rng.chance(backfireChance(activity, state));
      if (backfired) {
        applyEffects(activity.backfire!.effects as never, effectCtx);
      } else {
        applyEffects(activity.effects as never, effectCtx);
      }
      applyDeferred(effectCtx.deferred, state, this.content, this.config, rng, {});

      state.activityUsage[activityId] = used + 1;
      state.step += 1;
      pushHistory(
        state,
        'random',
        activity.icon,
        backfired ? activity.backfire!.line : historyLineFor(activity),
        backfired ? 35 : 12,
      );

      refreshDerived(state, this.config);
      checkInvariants(state, before);
      return { state, outcome: backfired ? 'backfired' : 'done' };
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  }

  /** What is for sale, with reasons where it is not. */
  shop(state: LifeState) {
    return shopView(state, this.content);
  }

  buy(state: LifeState, purchasableId: string) {
    return buy(state, purchasableId, this.content, this.config);
  }

  sell(state: LifeState, assetId: string) {
    return sell(state, assetId, this.config);
  }

  /** Everything the player could do right now, with reasons where they cannot. */
  actions(state: LifeState) {
    return actionsView(state, this.content);
  }

  /** The school screen, or null when the character is not enrolled. */
  school(state: LifeState) {
    return schoolView(state, this.content);
  }

  /** The work screen, or null when the character has no job. */
  work(state: LifeState) {
    return workView(state, this.content);
  }

  /** What the player can do to one specific person right now. */
  interactions(state: LifeState, npcId: string) {
    return interactionsFor(state, npcId, this.content);
  }

  /** Does something to one specific person. */
  interact(state: LifeState, npcId: string, interactionId: string) {
    return interact(state, npcId, interactionId, this.content, this.config);
  }

  /** Dismisses the result card (design 1A "Got it"). */
  dismiss(state: LifeState): LifeState {
    state.resolvedEvent = null;
    state.gameState = state.activeEvent ? 'EVENT_AVAILABLE' : 'IDLE';
    return state;
  }
}

/**
 * How likely a risky activity is to go wrong. A stat can buy the odds down, but
 * never to zero — a very clever cheat is still cheating.
 */
const backfireChance = (activity: Activity, state: LifeState): number => {
  const risk = activity.backfire;
  if (!risk) return 0;
  if (!risk.reducedBy) return risk.chance;
  const stat = state.character.stats[risk.reducedBy as keyof typeof state.character.stats] ?? 0;
  return Math.max(0.02, risk.chance * (1 - (stat / 100) * risk.reducedByMost));
};

/** The price of not knowing when to stop, growing with how far past it you are. */
const overdoIt = (state: LifeState, timesOver: number, rng: Rng): void => {
  const severity = Math.min(5, timesOver + 1);
  state.character.stats.health = clampStat(
    state.character.stats.health - severity - Math.round(rng.next() * 2),
  );
  state.character.stats.fitness = clampStat(state.character.stats.fitness - severity);
  state.character.stats.happiness = clampStat(state.character.stats.happiness - severity);
};

const overdoneLineFor = (activity: Activity): string => {
  const overrides: Record<string, string> = {
    get_in_shape: 'You trained through something you should have rested.',
    lift: 'You lifted through something you should have rested.',
    go_out: 'You went out again. It stopped being fun a while ago.',
    party: 'You went out again, and it cost you more than the night.',
    work_harder: 'You put in more hours and got less back.',
  };
  return overrides[activity.id] ?? `You overdid it on ${activity.label.toLowerCase()}.`;
};

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
