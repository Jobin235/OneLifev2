import type { ContentPack } from '@lineage/content';
import type { CountryPack, LifeState, Npc, Sex } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { makeId, makeRng, type Rng } from '@lineage/simulation';
import { instantiate } from '@lineage/event-engine';

/**
 * Meeting somebody.
 *
 * Relationships only ever started by an event firing at you, which meant a
 * player who wanted one could do nothing but age up and hope. BitLife makes it a
 * thing you go and do, and it introduces the candidate as a card you judge —
 * name, age, what they do, where they live, and four bars — so the decision is
 * made on facts rather than on a sentence. See docs/BITLIFE-LOOP-SPEC.md §5.
 */

const HOMES = [
  'a one-bed above a chip shop',
  'a shared house with four other people',
  'a flat with a balcony they never use',
  'their mother’s box room',
  'a new-build on the ring road',
  'a terrace they are slowly rebuilding',
  'a bungalow that smells of dog',
  'a top-floor flat with no lift',
];

const TRADES = [
  'Barista',
  'Paramedic',
  'Software Engineer',
  'Teaching Assistant',
  'Site Foreman',
  'Insurance Agent',
  'Chef',
  'Physiotherapist',
  'Bus Driver',
  'Graphic Designer',
  'Estate Agent',
  'Warehouse Picker',
];

/**
 * Puts a candidate on screen. As with the interview and the doctor, the person
 * rides in flags so one authored event covers everybody the player will ever
 * meet this way.
 */
export const openLoveInterest = (
  state: LifeState,
  country: CountryPack,
  content: ContentPack,
  rng: Rng,
): boolean => {
  const definition = content.eventsById.get('love_interest');
  if (!definition) return false;

  const { character } = state;
  const sex: Sex = rng.chance(0.5) ? 'male' : 'female';
  const pool = sex === 'female' ? country.firstNames.female : country.firstNames.male;
  const taken = new Set(state.npcs.filter((n) => n.alive).map((n) => n.firstName));
  const free = pool.filter((name) => !taken.has(name));
  const firstName = rng.pick(free.length > 0 ? free : pool);
  const lastName = rng.pick(country.surnames);

  /*
   * Roughly your own age, and never a minor. The window widens as the character
   * gets older, which is both true and what stops a sixty-year-old only ever
   * meeting sixty-year-olds.
   */
  const spread = Math.max(3, Math.round(character.age * 0.15));
  const age = Math.max(18, character.age + rng.int(-spread, spread));

  const looks = clampStat(rng.int(15, 95));
  const smarts = clampStat(rng.int(15, 95));
  const money = clampStat(rng.int(5, 90));
  const craziness = clampStat(rng.int(5, 95));

  state.flags.love_first = firstName;
  state.flags.love_last = lastName;
  state.flags.love_sex = sex;
  state.flags.love_age = age;
  state.flags.love_looks = looks;
  state.flags.love_smarts = smarts;
  state.flags.love_money = money;
  state.flags.love_craziness = craziness;
  state.flags.love_job = age < 22 && rng.chance(0.5) ? 'Student' : rng.pick(TRADES);
  state.flags.love_home = rng.pick(HOMES);
  state.flags.love_result = '';
  state.flags.love_result_title = '';

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);

  instance.card.who = {
    name: `${firstName} ${lastName}`,
    emoji: sex === 'female' ? '👩' : '🧑',
    relation: 'Love',
  };

  /*
   * The fact sheet and the bars are this person, not the event, so they are
   * filled here rather than authored. It is the same shape BitLife uses and the
   * reason a stranger can be judged in about two seconds.
   */
  instance.facts = [
    { label: 'Name', value: `${firstName} ${lastName}` },
    { label: 'Age', value: String(age) },
    { label: 'Occupation', value: String(state.flags.love_job) },
    { label: 'Lives in', value: String(state.flags.love_home) },
  ];
  instance.meters = [
    { label: 'Looks', value: looks },
    { label: 'Smarts', value: smarts },
    { label: 'Money', value: money },
    { label: 'Craziness', value: craziness },
  ];

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  return true;
};

/**
 * Asks them out, or does not. Called from the deferred layer once the player has
 * looked at the card.
 */
export const settleLoveInterest = (
  state: LifeState,
  askedOut: boolean,
  country: CountryPack,
): void => {
  const { character } = state;
  const firstName = String(state.flags.love_first ?? 'they');
  const lastName = String(state.flags.love_last ?? '');
  const sex = (state.flags.love_sex === 'female' ? 'female' : 'male') as Sex;
  const age = Number(state.flags.love_age ?? character.age);
  const looks = Number(state.flags.love_looks ?? 50);
  const smarts = Number(state.flags.love_smarts ?? 50);
  const money = Number(state.flags.love_money ?? 50);
  const craziness = Number(state.flags.love_craziness ?? 50);

  const clear = () => {
    for (const key of Object.keys(state.flags)) {
      if (key.startsWith('love_') && !key.startsWith('love_result') && key !== 'love_history') {
        delete state.flags[key];
      }
    }
  };

  if (!askedOut) {
    state.flags.love_result_title = 'Not for you';
    state.flags.love_result = `You did not follow it up, and neither did ${firstName}.`;
    state.flags.love_history = `You met ${firstName} ${lastName} and left it there.`;
    clear();
    return;
  }

  /*
   * Whether they say yes turns on what they can see: how you look, how you come
   * across, and — honestly — what you have. Someone much better looking than you
   * is a longer shot, which is the whole reason the bars are on the card.
   */
  const rng = makeRng(state.seed, 'love', firstName, character.age);
  const appeal =
    character.stats.charm * 0.45 +
    character.stats.happiness * 0.15 +
    Math.min(40, (character.finances.cash + character.finances.savings) / 250_00) * 0.4;
  const theirBar = looks * 0.6 + money * 0.2 + (100 - craziness) * 0.2;
  const chance = Math.max(0.12, Math.min(0.92, 0.5 + (appeal - theirBar) / 160));

  if (!rng.chance(chance)) {
    state.flags.love_result_title = 'Turned down';
    state.flags.love_result = `${firstName} was perfectly nice about it, which somehow made it worse.`;
    state.flags.love_history = `You asked ${firstName} ${lastName} out and were turned down.`;
    character.stats.happiness = clampStat(character.stats.happiness - 4);
    clear();
    return;
  }

  const npc: Npc = {
    id: makeId('npc', state.seed, 'love', character.age, state.npcs.length),
    firstName,
    lastName,
    sex,
    age,
    alive: true,
    avatarEmoji: sex === 'female' ? '👩' : '🧑',
    tier: 'tier1',
    descriptor: describe(craziness, smarts),
    traitIds: [],
    occupation: String(state.flags.love_job ?? null) || null,
    cityId: character.cityId,
    stats: {
      health: clampStat(60 + Math.round(looks / 8)),
      happiness: clampStat(55),
      smarts,
      fitness: clampStat(looks),
      charm: clampStat(looks),
    },
    wealth: money,
    isBloodline: false,
    parentNpcIds: [],
    ailments: [],
    retired: false,
    spouseNpcId: null,
    employerName: null,
  };

  state.npcs.push(npc);
  state.relationships.push({
    npcId: npc.id,
    kind: 'partner',
    formerKinds: [],
    dimensions: {
      affection: 62,
      trust: 55,
      respect: 55,
      conflict: 4,
      closeness: 60,
      romance: 72,
      dependence: 10,
    },
    sinceAge: character.age,
    lastContactAge: character.age,
    memories: [],
    onTheirMind: null,
    subtitle: '',
    band: 'close',
  });

  character.stats.happiness = clampStat(character.stats.happiness + 9);
  state.flags.love_result_title = "Let's give it a try";
  state.flags.love_result = `${firstName} said yes. You are seeing each other.`;
  state.flags.love_history = `You started seeing ${firstName} ${lastName}, ${age}, ${String(
    state.flags.love_job ?? 'unemployed',
  ).toLowerCase()}.`;
  void country;
  clear();
};

const describe = (craziness: number, smarts: number): string => {
  if (craziness > 75) return 'Great fun, and exhausting';
  if (smarts > 75) return 'Reads a lot, says little';
  if (craziness < 25) return 'Steady, and knows it';
  return 'Easy company';
};
