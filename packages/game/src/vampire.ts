import type { GameConfig } from '@lineage/config';
import { clampStat, type LifeState } from '@lineage/shared-types';
import { checkInvariants, makeRng, pushHistory, refreshDerived, type Rng } from '@lineage/simulation';

/**
 * The vampire.
 *
 * The only system in this game that changes the rules of the life rather than
 * adding a screen to it: you stop ageing, you stop dying of the things people
 * die of, and in exchange the thing that can kill you is hunters — and how many
 * of those come for you is a number you spend every time you feed.
 *
 * BitLife's version has essence, a notoriety that draws hunters, a coffin to
 * sleep it off, blood banks as the safe option, and a Vampire Lord at the top
 * that cannot be undone. All of that is here.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class VampireRejected extends Error {}

/** Nights a year. */
const NIGHTS_A_YEAR = 3;
/** Essence at which the change is permanent and the hunters stop mattering. */
export const LORD_AT = 600;

export const VAMPIRE_ACTIONS = ['hunt', 'bank', 'hypnotise', 'turn', 'coffin'] as const;
export type VampireAction = (typeof VAMPIRE_ACTIONS)[number];

const essence = (state: LifeState) => Number(state.flags.vamp_essence ?? 0);
const notoriety = (state: LifeState) => Number(state.flags.vamp_notoriety ?? 0);

export const isVampire = (state: LifeState): boolean => state.flags.vampire === true;
export const isLord = (state: LifeState): boolean => state.flags.vamp_lord === true;

/* ------------------------------------------------------------------ *
 * Being turned
 * ------------------------------------------------------------------ */

/**
 * Somebody finds you.
 *
 * Deliberately not a purchase and not a stat check: BitLife has a vampire in a
 * coffin who bites you and that is the whole of it. What it costs is everything
 * afterwards.
 */
export const turnVampire = (state: LifeState, config: GameConfig): LifeState => {
  if (isVampire(state)) throw new VampireRejected('you already are one');
  if (!state.character.alive) throw new VampireRejected('it is too late for that');
  if (state.activeEvent) throw new VampireRejected('answer the open decision first');
  if (state.character.age < 18) throw new VampireRejected('he will not do it to a child');

  const before = structuredClone(state);
  try {
    state.step += 1;
    state.flags.vampire = true;
    state.flags.vamp_essence = 60;
    state.flags.vamp_notoriety = 0;
    state.flags.vamp_turned_at = state.character.age;
    state.character.stats.health = clampStat(state.character.stats.health + 20);
    state.character.stats.charm = clampStat(state.character.stats.charm + 10);
    state.character.stats.happiness = clampStat(state.character.stats.happiness - 10);

    pushHistory(
      state,
      'random',
      '🧛',
      'Somebody came up the stairs who had not come in through a door. You are what he is now.',
      95,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The night
 * ------------------------------------------------------------------ */

const PREY = [
  'somebody walking home the long way',
  'a night porter who did not lock the side door',
  'a driver asleep in a lay-by',
  'somebody who recognised you and said so',
  'a man who had been following somebody else',
];

export interface VampireResult {
  state: LifeState;
  line: string;
  essence: number;
  notoriety: number;
}

export const vampireAct = (
  state: LifeState,
  action: VampireAction,
  config: GameConfig,
): VampireResult => {
  if (!isVampire(state)) throw new VampireRejected('you are not one');
  const lock = vampireLock(state, action);
  if (lock) throw new VampireRejected(lock.toLowerCase());

  const before = structuredClone(state);
  try {
    const nights = Number(state.flags.vamp_nights ?? 0);
    const rng = makeRng(state.seed, 'vamp', action, state.character.age, nights);
    state.flags.vamp_nights = nights + 1;
    state.step += 1;

    let line = '';
    switch (action) {
      case 'hunt': {
        /*
         * The trade the whole system is built on: the most essence, and the
         * most attention. Everything else is a way of avoiding this and paying
         * for the privilege.
         */
        const gained = rng.int(40, 110);
        state.flags.vamp_essence = essence(state) + gained;
        state.flags.vamp_notoriety = clampStat(notoriety(state) + rng.int(11, 20));
        state.character.stats.happiness = clampStat(state.character.stats.happiness - 4);
        line = `You fed on ${rng.pick(PREY)}.`;
        break;
      }

      case 'bank': {
        // Safe, cold, and worth about a third of the real thing.
        const gained = rng.int(12, 30);
        state.flags.vamp_essence = essence(state) + gained;
        state.flags.vamp_notoriety = clampStat(notoriety(state) + 2);
        line = 'You paid somebody at a blood bank and drank it in the car.';
        break;
      }

      case 'hypnotise': {
        /*
         * Charm, and a way of using the position for something other than
         * blood. It is the only action that gives back money, which is what
         * stops immortality being financially inconvenient.
         */
        const taken = Math.round(essence(state) * 900 * (0.5 + rng.next()));
        state.character.finances.cash += taken;
        state.flags.vamp_notoriety = clampStat(notoriety(state) + 6);
        state.character.stats.charm = clampStat(state.character.stats.charm + 1);
        line = 'You told somebody what to think and they went to the bank and did it.';
        break;
      }

      case 'turn': {
        // A progeny costs essence and buys standing among things like you.
        if (essence(state) < 120) throw new VampireRejected('you are not strong enough yet');
        state.flags.vamp_essence = essence(state) - 100;
        state.flags.vamp_progeny = Number(state.flags.vamp_progeny ?? 0) + 1;
        state.flags.vamp_notoriety = clampStat(notoriety(state) + 12);
        line = 'You made another one. It took three nights and they screamed for two of them.';
        break;
      }

      case 'coffin': {
        /*
         * A year underground. The only way notoriety comes down quickly, and
         * the reason a vampire's life has a rhythm rather than a slope.
         */
        state.flags.vamp_notoriety = clampStat(notoriety(state) - rng.int(35, 60));
        state.flags.vamp_nights = NIGHTS_A_YEAR;
        state.character.stats.health = clampStat(state.character.stats.health + 6);
        line = 'You went under the house and did not come up for a long time.';
        break;
      }
    }

    if (!isLord(state) && essence(state) >= LORD_AT) {
      state.flags.vamp_lord = true;
      pushHistory(
        state,
        'random',
        '👁️',
        'There is nothing above you now. Whatever you were before this, it is gone.',
        99,
      );
    }

    pushHistory(state, 'random', action === 'coffin' ? '⚰️' : '🧛', line, 25);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, line, essence: essence(state), notoriety: notoriety(state) };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

export const vampireLock = (state: LifeState, action: VampireAction): string | null => {
  if (!isVampire(state)) return 'You are not one';
  if (!state.character.alive) return 'You are dead. Properly, this time';
  if (state.activeEvent) return 'Answer the open decision first';
  if (state.character.record.incarceration) return 'Not from in here';
  if (Number(state.flags.vamp_nights ?? 0) >= NIGHTS_A_YEAR) {
    return 'The nights are getting short';
  }
  if (action === 'turn' && essence(state) < 120) return 'You are not strong enough yet';
  return null;
};

/* ------------------------------------------------------------------ *
 * The year
 * ------------------------------------------------------------------ */

/**
 * One year of it: the hunters, and the fact that nothing else can touch you.
 *
 * Notoriety is what brings them, essence is what survives them, and a Lord is
 * past both — which is the reward for the whole climb and the reason it is
 * permanent.
 */
export const advanceVampireYear = (state: LifeState, rng: Rng): void => {
  delete state.flags.vamp_nights;
  if (!isVampire(state) || !state.character.alive) return;

  // It fades on its own, slowly. The coffin is for when slowly is not enough.
  state.flags.vamp_notoriety = clampStat(notoriety(state) - 9);

  // Essence leaks. A vampire who does not feed becomes a weak one.
  state.flags.vamp_essence = Math.max(0, Math.round(essence(state) * 0.94));

  if (isLord(state)) return;

  const chance = notoriety(state) / 260;
  if (!rng.chance(chance)) return;

  /*
   * A hunter. Whether you survive is essence against how long they have been
   * looking for you, and losing is the end of the life — the one thing that
   * can still end it.
   */
  /*
   * Essence against how badly they want you. Not essence alone: the first pass
   * did that and a vampire who fed constantly became unkillable, because
   * feeding is also what raises essence. Being notorious buys you better
   * hunters, which is the trade the whole system is supposed to be about.
   */
  const survived = rng.chance(
    Math.max(0.15, Math.min(0.9, 0.3 + essence(state) / 1500 - notoriety(state) / 220)),
  );
  if (survived) {
    state.flags.vamp_essence = Math.max(0, essence(state) - 40);
    state.flags.vamp_notoriety = clampStat(notoriety(state) - 20);
    pushHistory(
      state,
      'random',
      '🗡️',
      'Somebody was waiting for you with something wooden. They are not waiting any more.',
      70,
    );
    return;
  }

  /*
   * Not killed here. The year has a death step of its own that has to set half
   * a dozen fields, tidy the card and build the recap — reaching around it and
   * flipping `alive` left the state failing its own invariant a moment later.
   * This raises the flag; the death step reads it.
   */
  state.flags.vamp_slain = true;
  pushHistory(state, 'random', '🪦', 'They got you in the end. They usually do.', 100);
};

/** Whether a hunter finished it this year, for the year's own death step. */
export const vampireWasSlain = (state: LifeState): boolean => state.flags.vamp_slain === true;

/**
 * What being one does to an ordinary year.
 *
 * Called from the health step: a vampire does not get older in the way that
 * matters, which is the whole appeal and the reason the hunters have to be real.
 */
export const vampireHoldsAge = (state: LifeState): boolean => isVampire(state);

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export interface VampireView {
  /** Null when they are not one; the row still shows, to offer it. */
  turned: boolean;
  lord: boolean;
  essence: number;
  /** 0..100 for the bar, since essence has no ceiling. */
  essenceBar: number;
  notoriety: number;
  notorietyWord: string;
  progeny: number;
  nightsLeft: number;
  actions: Array<{
    id: VampireAction;
    emoji: string;
    label: string;
    note: string;
    available: boolean;
    locked: string | null;
  }>;
}

const COPY: Record<VampireAction, { emoji: string; label: string; note: string }> = {
  hunt: { emoji: '🩸', label: 'Hunt', note: 'The most of it, and the most attention' },
  bank: { emoji: '🏥', label: 'Go to a blood bank', note: 'Cold, safe, and about a third as good' },
  hypnotise: { emoji: '🌀', label: 'Hypnotise somebody', note: 'They will go to the bank for you' },
  turn: { emoji: '🦇', label: 'Make another one', note: 'Costs essence. They will remember who made them' },
  coffin: { emoji: '⚰️', label: 'Sleep it off', note: 'A year underground, and they forget you' },
};

export const vampireView = (state: LifeState): VampireView => ({
  turned: isVampire(state),
  lord: isLord(state),
  essence: essence(state),
  essenceBar: Math.min(100, Math.round((essence(state) / LORD_AT) * 100)),
  notoriety: notoriety(state),
  notorietyWord:
    notoriety(state) >= 70
      ? 'They are hunting you'
      : notoriety(state) >= 40
        ? 'Somebody is asking'
        : notoriety(state) >= 15
          ? 'A rumour'
          : 'Nothing',
  progeny: Number(state.flags.vamp_progeny ?? 0),
  nightsLeft: Math.max(0, NIGHTS_A_YEAR - Number(state.flags.vamp_nights ?? 0)),
  actions: VAMPIRE_ACTIONS.map((id) => {
    const locked = vampireLock(state, id);
    return { id, ...COPY[id], available: locked === null, locked };
  }),
});
