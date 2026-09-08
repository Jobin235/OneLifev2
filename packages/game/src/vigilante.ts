import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import { clampStat, type LifeState, type Vigilante } from '@lineage/shared-types';
import {
  applyFameDelta,
  checkInvariants,
  makeRng,
  pushHistory,
  refreshDerived,
  type Rng,
} from '@lineage/simulation';
import { instantiate } from '@lineage/event-engine';
import { openCharges } from './justice.js';
import { isVampire } from './vampire.js';

/**
 * The other life.
 *
 * Every other system in this game is one life doing one more thing. This one is
 * two lives, and the number that matters is not how many people you got home —
 * it is how close the first life is to finding out about the second.
 *
 * The failure state is deliberately not death. Being unmasked ends the mask,
 * hands you to the courts, and tells everybody you know, which for most
 * characters is considerably worse than a heart attack.
 */

export class VigilanteRejected extends Error {}

/** Nights a year. */
const NIGHTS_A_YEAR = 3;

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/* ------------------------------------------------------------------ *
 * The gear
 * ------------------------------------------------------------------ */

export const GEAR = [
  {
    id: 'mask',
    emoji: '🎭',
    label: 'Something over your face',
    note: 'The whole thing starts here',
    price: 4_000_00,
    edge: 4,
    quiet: 14,
  },
  {
    id: 'vest',
    emoji: '🦺',
    label: 'A vest under the coat',
    note: 'You will still feel it. You will get up',
    price: 40_000_00,
    edge: 10,
    quiet: 0,
  },
  {
    id: 'scanner',
    emoji: '📻',
    label: 'The police band',
    note: 'You get there before they do',
    price: 18_000_00,
    edge: 8,
    quiet: 4,
  },
  {
    id: 'van',
    emoji: '🚐',
    label: 'A van with nothing written on it',
    note: 'Nobody follows you home',
    price: 120_000_00,
    edge: 6,
    quiet: 18,
  },
  {
    id: 'rig',
    emoji: '🪝',
    label: 'A line and a winch',
    note: 'Up, and gone, before anybody looks up',
    price: 300_000_00,
    edge: 14,
    quiet: 8,
  },
];

const gearBonus = (v: Vigilante): { edge: number; quiet: number } =>
  GEAR.reduce(
    (sum, g) =>
      v.gearIds.includes(g.id)
        ? { edge: sum.edge + g.edge, quiet: sum.quiet + g.quiet }
        : sum,
    { edge: 0, quiet: 0 },
  );

/**
 * How good you are at this tonight.
 *
 * Fitness and smarts, the gear, and — because it exists — being something that
 * does not need to breathe. A vampire is simply better at this, which is the
 * one place the two systems are allowed to notice each other.
 */
const capability = (state: LifeState): number => {
  const v = state.vigilante;
  const gear = v ? gearBonus(v).edge : 0;
  const undead = isVampire(state) ? 25 : 0;
  return (
    state.character.stats.fitness * 0.5 +
    state.character.stats.smarts * 0.3 +
    state.character.stats.charm * 0.1 +
    gear +
    undead
  );
};

/* ------------------------------------------------------------------ *
 * Starting
 * ------------------------------------------------------------------ */

/**
 * The city names you, not the other way round.
 *
 * Which is the point: you do not get to decide what this looks like from
 * outside. The name arrives after the first night and is drawn from how it went.
 */
const ALIASES = [
  'the Nightjar',
  'the Woman in the Coat',
  'Coldharbour',
  'the Quiet One',
  'the Man Who Waits',
  'the Lamplighter',
  'Ashgrove',
  'the Thing on the Roof',
];

export const startVigilante = (state: LifeState, config: GameConfig): LifeState => {
  if (state.vigilante) throw new VigilanteRejected('you already do this');
  if (state.flags.unmasked) throw new VigilanteRejected('everybody knows who you are');
  const lock = vigilanteLock(state);
  if (lock) throw new VigilanteRejected(lock.toLowerCase());
  if (state.character.age < 16) throw new VigilanteRejected('you are too young for this');

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'vigilante', state.character.age);
    state.step += 1;
    state.vigilante = {
      alias: rng.pick(ALIASES),
      sinceAge: state.character.age,
      standing: 40,
      suspicion: 0,
      saved: 0,
      broken: 0,
      gearIds: [],
      nightsThisYear: 0,
      unmasked: false,
    };
    pushHistory(
      state,
      'crime',
      '🌃',
      `You went out at night and did something about it. The papers are calling you ${state.vigilante.alias}.`,
      80,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

export const buyGear = (
  state: LifeState,
  gearId: string,
  config: GameConfig,
): LifeState => {
  const v = state.vigilante;
  const gear = GEAR.find((g) => g.id === gearId);
  if (!v || !gear) throw new VigilanteRejected('there is no such thing');
  if (v.gearIds.includes(gearId)) throw new VigilanteRejected('you have that');
  const lock = vigilanteLock(state);
  if (lock) throw new VigilanteRejected(lock.toLowerCase());

  const f = state.character.finances;
  if (gear.price > f.cash + f.savings) throw new VigilanteRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    state.step += 1;
    const fromCash = Math.min(f.cash, gear.price);
    f.cash -= fromCash;
    f.savings -= gear.price - fromCash;
    v.gearIds.push(gearId);
    pushHistory(state, 'crime', gear.emoji, `${gear.label}. ${money(gear.price)}.`, 15);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * A night
 * ------------------------------------------------------------------ */

const INCIDENTS = [
  {
    id: 'mugging',
    title: 'Behind the parade of shops',
    body: 'Two of them and one of somebody else. It is going badly and it has been going badly for a minute before you got there.',
    saved: 1,
    danger: 34,
  },
  {
    id: 'break',
    title: 'A window at the back',
    body: 'The house has somebody asleep upstairs in it, and somebody downstairs who is not asleep and did not come in through the door.',
    saved: 1,
    danger: 40,
  },
  {
    id: 'car',
    title: 'Under the flyover',
    body: 'A car on its roof, and somebody standing at the top of the embankment on the phone, not coming down.',
    saved: 2,
    danger: 22,
  },
  {
    id: 'stall',
    title: 'The row of lock-ups',
    body: 'Four of them are moving something into a van at two in the morning, and none of them are hurrying.',
    saved: 0,
    danger: 55,
  },
  {
    id: 'fire',
    title: 'The top floor of a terrace',
    body: 'It has gone up the stairwell and the engines are eleven minutes out. Somebody is at the window.',
    saved: 2,
    danger: 62,
  },
];

/** Opens the card. The incident rides in flags, the way every other one does. */
const openIncident = (state: LifeState, content: ContentPack, rng: Rng): boolean => {
  const definition = content.eventsById.get('vigilante_incident');
  if (!definition) return false;

  const incident = rng.pick(INCIDENTS);
  state.flags.vig_incident = incident.id;
  state.flags.vig_title = incident.title;
  state.flags.vig_body = incident.body;
  state.flags.vig_saved = incident.saved;
  state.flags.vig_danger = incident.danger;
  state.flags.vig_result = '';
  state.flags.vig_result_title = '';

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);
  instance.stake = {
    label: 'How this goes',
    value: `${Math.round(Math.min(94, capability(state) - incident.danger / 2 + 40))}% yours`,
  };

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  return true;
};

/** Goes out. Raises the incident rather than deciding anything. */
export const goOut = (state: LifeState, content: ContentPack, config: GameConfig): LifeState => {
  const v = state.vigilante;
  if (!v) throw new VigilanteRejected('you do not do this');
  const lock = vigilanteLock(state);
  if (lock) throw new VigilanteRejected(lock.toLowerCase());
  if (v.nightsThisYear >= NIGHTS_A_YEAR) throw new VigilanteRejected('you cannot be out every night');

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'vignight', state.character.age, v.nightsThisYear);
    v.nightsThisYear += 1;
    state.step += 1;
    if (!openIncident(state, content, rng)) throw new VigilanteRejected('a quiet night, in the end');
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/**
 * Settles it. Called from the deferred layer once the player has chosen.
 *
 * The three answers are the whole system. Handing somebody over is slow and the
 * city likes it; dealing with it yourself works and the city splits; walking
 * away with the person costs you nothing at all except what you came for.
 */
export const settleIncident = (
  state: LifeState,
  how: 'police' | 'hard' | 'walk',
  content: ContentPack,
  rng: Rng,
): void => {
  const v = state.vigilante;
  if (!v) return;

  const danger = Number(state.flags.vig_danger ?? 40);
  const couldSave = Number(state.flags.vig_saved ?? 1);
  const edge = capability(state);
  const { quiet } = gearBonus(v);

  /*
   * Whether it goes well at all. Capability against how bad it was, and going
   * in hard is more likely to work and much more likely to leave a mark on
   * everybody involved, including you.
   */
  const lean = how === 'hard' ? 14 : how === 'walk' ? 22 : 0;
  const won = rng.chance(Math.max(0.15, Math.min(0.95, (edge + lean - danger) / 100 + 0.5)));

  /*
   * Suspicion is the price of the night, and it is paid whatever happens.
   * Being seen is not a failure — being seen is the job.
   */
  /*
   * Tuned against a probe rather than guessed. The first numbers put twelve
   * points on this a night and unmasked every character inside three years,
   * which is not a second life, it is an anecdote. A masked figure with no
   * gear now gets about a decade; one who has bought the van and the line can
   * keep it up more or less indefinitely, which is what the gear is for.
   */
  const seen = Math.max(1, Math.round((danger / 9 + (how === 'hard' ? 5 : 2)) * (1 - quiet / 110)));
  v.suspicion = clampStat(v.suspicion + seen);

  if (!won) {
    /*
     * A bad night. The vest is the difference between a bad night and a
     * hospital, which is why it costs what it costs.
     */
    const hurt = v.gearIds.includes('vest') ? rng.int(6, 14) : rng.int(14, 30);
    state.character.stats.health = clampStat(state.character.stats.health - hurt);
    v.standing = clampStat(v.standing - 6);
    state.flags.vig_result_title = 'It went badly';
    state.flags.vig_result =
      'You got it wrong somewhere in the first ten seconds and spent the rest of it getting out.';
    state.flags.vig_history = `${v.alias} came off worst somewhere off the high street.`;
    clearIncident(state);
    return;
  }

  v.saved += couldSave;
  state.character.stats.happiness = clampStat(state.character.stats.happiness + 4);

  /*
   * The mask gets known, but it does not get to overwrite what somebody is
   * already known for: a television presenter who spends three nights in a
   * coat is not suddenly known for the coat. The alias only becomes the answer
   * while it is the biggest thing about you — and at the unmasking, where it
   * becomes the answer whatever else was true.
   */
  const claim = state.character.fame.following < 40_000 ? v.alias : undefined;

  if (how === 'police') {
    v.standing = clampStat(v.standing + 11);
    applyFameDelta(state.character, { following: 1_400, fans: 3, knownFor: claim });
    state.flags.vig_result_title = 'They were still there when the car came';
    state.flags.vig_result =
      'You waited across the road until it arrived, which is the part nobody photographs.';
    state.flags.vig_history = `${v.alias} left somebody tied to a railing for the police.`;
  } else if (how === 'hard') {
    v.broken += 1;
    v.standing = clampStat(v.standing - 9);
    applyFameDelta(state.character, { following: 3_200, haters: 5, knownFor: claim });
    state.character.stats.happiness = clampStat(state.character.stats.happiness - 6);
    state.flags.vig_result_title = 'They will not do it again';
    state.flags.vig_result =
      'It worked. Half the city thinks you are what is wrong with the other half.';
    state.flags.vig_history = `${v.alias} put somebody in hospital, and it was in the paper.`;
  } else {
    v.standing = clampStat(v.standing + 3);
    state.flags.vig_result_title = 'You got them out';
    state.flags.vig_result = 'Nobody was arrested and nobody was hurt, which is two out of three.';
    state.flags.vig_history = `${v.alias} got somebody home and did not stay to explain.`;
  }

  clearIncident(state);
  void content;
};

const clearIncident = (state: LifeState): void => {
  for (const key of ['vig_incident', 'vig_title', 'vig_body', 'vig_saved', 'vig_danger']) {
    delete state.flags[key];
  }
};

/** A year of not going out. The only thing that brings suspicion down quickly. */
export const lieLow = (state: LifeState, config: GameConfig): LifeState => {
  const v = state.vigilante;
  if (!v) throw new VigilanteRejected('you do not do this');
  const lock = vigilanteLock(state);
  if (lock) throw new VigilanteRejected(lock.toLowerCase());

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'viglow', state.character.age);
    state.step += 1;
    v.nightsThisYear = NIGHTS_A_YEAR;
    v.suspicion = clampStat(v.suspicion - rng.int(22, 40));
    // The city forgets faster than the police do.
    v.standing = clampStat(v.standing - 5);
    pushHistory(state, 'crime', '🌙', 'You left the coat where it was for a year.', 20);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The year
 * ------------------------------------------------------------------ */

/**
 * One year of it, and the only thing that can end it.
 *
 * Not death. Somebody works it out, the mask comes off, and the ordinary life —
 * the job, the name, the people — takes the whole weight of what the other one
 * has been doing. That is the wager the entire system is.
 */
export const advanceVigilanteYear = (
  state: LifeState,
  content: ContentPack,
  rng: Rng,
): void => {
  const v = state.vigilante;
  if (!v || !state.character.alive) return;
  const wentOut = v.nightsThisYear > 0;
  v.nightsThisYear = 0;

  // People forget a face they have not seen for a while.
  v.suspicion = clampStat(v.suspicion - (wentOut ? 6 : 14));

  // The city's opinion drifts toward whatever it last saw.
  if (v.standing > 50) v.standing = clampStat(v.standing - 2);
  else if (v.standing < 50) v.standing = clampStat(v.standing + 1);

  /*
   * Somebody putting it together is a slow accumulation rather than a cliff:
   * a file with your name in it is survivable for years, and a description is
   * survivable for decades. A hundred is somebody knocking on the door.
   */
  if (v.suspicion < 100 && !rng.chance(Math.max(0, v.suspicion - 20) / 420)) return;

  /*
   * Somebody put it together. A city that likes you can be persuaded not to
   * press it; one that does not gets its trial. Standing is what the whole
   * "hand them over or break them" question has been buying all along.
   */
  unmask(state, content, rng);
};

const unmask = (state: LifeState, content: ContentPack, rng: Rng): void => {
  const v = state.vigilante;
  if (!v) return;

  v.unmasked = true;
  state.flags.unmasked = true;
  state.flags.former_alias = v.alias;
  applyFameDelta(state.character, {
    following: 60_000,
    fans: v.standing >= 60 ? 30 : 0,
    haters: v.standing >= 60 ? 0 : 30,
    knownFor: 'being the one under the mask',
  });

  const forgiven = rng.chance(Math.min(0.8, v.standing / 110));
  state.vigilante = null;

  if (forgiven) {
    pushHistory(
      state,
      'crime',
      '📰',
      `Somebody worked out that ${v.alias} was you and printed it. The city decided it was pleased.`,
      92,
    );
    state.character.stats.happiness = clampStat(state.character.stats.happiness - 8);
    return;
  }

  pushHistory(
    state,
    'crime',
    '📰',
    `Somebody worked out that ${v.alias} was you and printed it. Everybody you know found out at the same time as everybody else.`,
    96,
  );
  state.character.stats.happiness = clampStat(state.character.stats.happiness - 25);

  openCharges(
    state,
    {
      offence: v.broken > 0 ? 'Grievous bodily harm' : 'Affray',
      sentenceYears: v.broken > 0 ? 8 : 3,
      fine: 0,
      facility: v.broken > 0 ? 'the state penitentiary' : 'the county jail',
    },
    content,
    rng,
  );
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export const vigilanteLock = (state: LifeState): string | null => {
  if (!state.character.alive) return 'You are dead';
  if (state.activeEvent) return 'Answer the open decision first';
  if (state.character.record.incarceration) return 'Not from in here';
  return null;
};

const STANDING_WORD = (n: number): string => {
  if (n >= 80) return 'The city is on your side';
  if (n >= 60) return 'Mostly welcome';
  if (n >= 40) return 'Argued about';
  if (n >= 20) return 'A problem';
  return 'A menace, in print';
};

const SUSPICION_WORD = (n: number): string => {
  if (n >= 80) return 'Somebody knows';
  if (n >= 55) return 'Somebody is close';
  if (n >= 30) return 'A file with your name in it';
  if (n > 0) return 'A description';
  return 'Nothing';
};

export interface VigilanteView {
  /** Null when they have never done it; the row still shows, to offer it. */
  active: boolean;
  unmasked: boolean;
  alias: string;
  standing: number;
  standingWord: string;
  suspicion: number;
  suspicionWord: string;
  saved: number;
  broken: number;
  nightsLeft: number;
  locked: string | null;
  gear: Array<{
    id: string;
    emoji: string;
    label: string;
    note: string;
    price: string;
    owned: boolean;
    affordable: boolean;
  }>;
}

export const vigilanteView = (state: LifeState): VigilanteView => {
  const v = state.vigilante;
  const purse = state.character.finances.cash + state.character.finances.savings;

  return {
    active: v !== null,
    unmasked: state.flags.unmasked === true,
    alias: v?.alias ?? String(state.flags.former_alias ?? ''),
    standing: v?.standing ?? 0,
    standingWord: STANDING_WORD(v?.standing ?? 0),
    suspicion: v?.suspicion ?? 0,
    suspicionWord: SUSPICION_WORD(v?.suspicion ?? 0),
    saved: v?.saved ?? 0,
    broken: v?.broken ?? 0,
    nightsLeft: Math.max(0, NIGHTS_A_YEAR - (v?.nightsThisYear ?? 0)),
    locked: vigilanteLock(state),
    gear: GEAR.map((g) => ({
      id: g.id,
      emoji: g.emoji,
      label: g.label,
      note: g.note,
      price: money(g.price),
      owned: v?.gearIds.includes(g.id) ?? false,
      affordable: g.price <= purse,
    })),
  };
};
