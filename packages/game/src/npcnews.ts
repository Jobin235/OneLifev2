import type { ContentPack } from '@lineage/content';
import type {
  CountryPack,
  LifeState,
  Npc,
  Relationship,
  RelationshipKind,
  Sex,
} from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import {
  formatMoneyExact,
  makeId,
  narrativeSubject,
  narrativeTerm,
  pushHistory,
  type Rng,
} from '@lineage/simulation';
import { employerNameFor } from './deferred.js';

/**
 * The world moves without you.
 *
 * This is the thing our log was missing and BitLife's is made of: most of what
 * you read in a given year happened to somebody else. Your sister gets promoted,
 * your mother is diagnosed with something, your brother marries a stranger and
 * two years later you have a nephew, a friend quietly unfriends you. None of it
 * is yours to decide, and all of it is why a life reads as a life rather than as
 * a stat sheet with dates on it. See docs/BITLIFE-LOOP-SPEC.md §4.
 *
 * Every line here is a consequence of a stored change — an occupation, a spouse
 * id, an ailment with a diagnosis age — so a thread the log opens is one it can
 * close years later, and nothing is decoration.
 */
export const runNpcNews = (
  state: LifeState,
  content: ContentPack,
  rng: Rng,
): void => {
  const country = content.countriesById.get(state.character.countryId);
  if (!country) return;

  const playerAge = state.character.age;
  const byId = new Map(state.npcs.map((n) => [n.id, n]));

  // A snapshot: people born during this tick do not also get news in it.
  for (const rel of [...state.relationships]) {
    const npc = byId.get(rel.npcId);
    if (!npc || !npc.alive) continue;
    if (!TELLS_YOU_THINGS.has(rel.kind)) continue;

    /*
     * Distance decides how much you hear, not how much happens. Somebody you
     * live with reports most of their year; a drifted acquaintance surfaces once
     * a decade, and that is the correct amount of news about them.
     */
    const reach = rel.band === 'close' ? 0.5 : rel.band === 'around' ? 0.28 : 0.08;
    if (!rng.chance(reach)) continue;

    tellOne(state, rel, npc, country, content, rng, playerAge);
  }
};

/** Relations whose lives the player would actually hear about. */
const TELLS_YOU_THINGS = new Set<RelationshipKind>([
  'mother',
  'father',
  'sibling',
  'child',
  'spouse',
  'partner',
  'grandparent',
  'grandchild',
  'niece_nephew',
  'friend',
  'best_friend',
  'in_law',
]);

/**
 * One piece of news about one person.
 *
 * Every kind of news that is currently possible for them is collected first and
 * then one is drawn, rather than checked in a fixed order. An ordered cascade
 * looked reasonable and was not: illness and work sit near the top and fire
 * most years, so marriages and births at the bottom effectively never happened,
 * and a sixty-year life ended with no nieces or nephews in it at all.
 */
const tellOne = (
  state: LifeState,
  rel: Relationship,
  npc: Npc,
  country: CountryPack,
  content: ContentPack,
  rng: Rng,
  playerAge: number,
): void => {
  const who = narrativeSubject(rel, npc, playerAge, state);
  /*
   * "Your mother" needs no name; "Your nephew" does, because you can have four
   * of them. Without this, two nephews diagnosed in consecutive years produced
   * the identical sentence twice, which reads as the log stuttering.
   */
  const term = ONE_OF_THEM.has(rel.kind) ? narrativeTerm(rel, npc, playerAge) : who;

  /*
   * Schooling is not news that might happen — it is the year they turned that
   * age, so it pre-empts the draw rather than competing in it.
   *
   * Only for the family, though. A classmate starting high school in the same
   * year the player does is not news, and with three of them in a year the log
   * spent its lines telling you what you already knew about yourself.
   */
  const milestone = SCHOOL_MILESTONES[npc.age];
  if (milestone && GROWS_UP_IN_THE_LOG.has(rel.kind)) {
    say(state, '🎒', `${who} ${milestone}.`);
    return;
  }

  const options: Array<{ weight: number; run: () => void }> = [];

  // Something they caught, or got over.
  const ailing = npc.ailments.find((a) => a.healedAtAge === null);
  if (ailing && playerAge - ailing.sinceAge >= 1) {
    options.push({
      weight: 3,
      run: () => {
        ailing.healedAtAge = playerAge;
        say(state, '🩺', `${term} is no longer suffering from ${ailing.label}.`);
      },
    });
  }
  if (!ailing && npc.age >= 3) {
    // Never the same thing twice: they keep their medical history, and the pool
    // is what they have not already had.
    const had = new Set(npc.ailments.map((a) => a.label));
    const pool = (npc.age > 45 ? OLDER_AILMENTS : AILMENTS).filter((label) => !had.has(label));
    if (pool.length > 0) {
      options.push({
        weight: npc.age > 55 ? 4 : 2,
        run: () => {
          const label = rng.pick(pool);
          npc.ailments.push({
            id: label.toLowerCase().replace(/\W+/g, '_'),
            label,
            sinceAge: playerAge,
            healedAtAge: null,
          });
          say(state, '🩺', `${term} has been diagnosed with ${label}.`);
        },
      });
    }
  }

  // Work: a first job, a promotion, or the end of one.
  if (!npc.retired && npc.age >= 62 && npc.occupation) {
    options.push({
      weight: 5,
      run: () => {
        npc.retired = true;
        npc.occupation = null;
        npc.employerName = null;
        say(state, '🎣', `${term} retired.`);
      },
    });
  }
  if (!npc.retired && npc.age >= 18 && npc.age < 65) {
    if (!npc.occupation) {
      options.push({
        weight: 4,
        run: () => {
          const job = pickJob(content, npc, rng);
          npc.occupation = job.title;
          npc.employerName = job.employer;
          say(state, '💼', `${who} started a new position as ${job.title} for ${job.employer}.`);
        },
      });
    } else {
      const next = promotionTitle(content, npc);
      if (next) {
        options.push({
          weight: 3,
          run: () => {
            npc.occupation = next;
            say(state, '📈', `${who} has been promoted to ${next}.`);
          },
        });
      }
    }
  }

  // Family: marriage, then children, years apart.
  if (CAN_MARRY.has(rel.kind) && !npc.spouseNpcId && npc.age >= 21 && npc.age <= 48) {
    options.push({
      weight: 4,
      run: () => {
        const spouse = spawnRelative(state, country, rng, {
          sex: npc.sex === 'female' ? 'male' : 'female',
          age: npc.age + rng.int(-4, 4),
          kind: 'in_law',
          lastName: rng.pick(country.surnames),
        });
        npc.spouseNpcId = spouse.id;
        spouse.spouseNpcId = npc.id;
        const trade = spouse.occupation ?? 'unemployed person';
        say(
          state,
          '💍',
          `${who} married ${spouse.firstName} ${spouse.lastName}, a ${spouse.age}-year-old ${trade.toLowerCase()}.`,
        );
      },
    });
  }

  // A sibling's child is your niece or nephew, and they grow up in the log —
  // starting school, graduating, taking a first job — for the rest of the life.
  if (rel.kind === 'sibling' && npc.spouseNpcId && npc.age >= 22 && npc.age <= 45) {
    options.push({
      weight: 5,
      run: () => {
        const spouse = state.npcs.find((n) => n.id === npc.spouseNpcId);
        const sex: Sex = rng.chance(0.5) ? 'male' : 'female';
        const baby = spawnRelative(state, country, rng, {
          sex,
          age: 0,
          kind: 'niece_nephew',
          lastName: npc.lastName,
          parentNpcIds: [npc.id, ...(spouse ? [spouse.id] : [])],
        });
        /*
         * "Your little brother, Randy, and his wife, Carrie, had a baby boy" —
         * the subject phrase already closes its own appositive, so the partner
         * is spliced in before that comma rather than after it.
         */
        const withPartner = spouse
          ? `${who.replace(/,$/, '')} and ${npc.sex === 'female' ? 'her husband' : 'his wife'}, ${spouse.firstName},`
          : who;
        say(
          state,
          '👶',
          `${withPartner} had a baby ${sex === 'female' ? 'girl' : 'boy'} named ${baby.firstName} ${baby.lastName}.`,
        );
      },
    });
  }

  if (
    rel.kind === 'sibling' &&
    npc.age >= 18 &&
    npc.age <= 26 &&
    !state.flags[`moved_out_${npc.id}`]
  ) {
    options.push({
      weight: 3,
      run: () => {
        state.flags[`moved_out_${npc.id}`] = true;
        say(state, '📦', `${who} moved out.`);
      },
    });
  }

  // Friends drift, and the log says so rather than the number quietly falling.
  if ((rel.kind === 'friend' || rel.kind === 'best_friend') && rel.dimensions.closeness < 30) {
    options.push({
      weight: 4,
      run: () => {
        rel.kind = 'acquaintance';
        rel.formerKinds.push('friend');
        say(state, '💔', `${npc.firstName} ${npc.lastName} unfriended you.`);
      },
    });
  }

  if (options.length === 0) return;
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng.next() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) {
      option.run();
      return;
    }
  }
  options[options.length - 1]!.run();
};

/** Marriage is news when it is somebody else's. The player's own is an event. */
const CAN_MARRY = new Set<RelationshipKind>(['sibling', 'child', 'friend', 'best_friend']);

/** Relations there can only be one of, so the log can leave the name off. */
const ONE_OF_THEM = new Set<RelationshipKind>(['mother', 'father', 'spouse', 'partner']);

/** People whose childhood the player watches happen. */
const GROWS_UP_IN_THE_LOG = new Set<RelationshipKind>([
  'sibling',
  'child',
  'niece_nephew',
  'grandchild',
]);

const SCHOOL_MILESTONES: Record<number, string> = {
  5: 'started elementary school',
  11: 'started middle school',
  14: 'started high school',
  18: 'graduated from high school',
};

const AILMENTS = [
  'the flu',
  'strep throat',
  'a broken wrist',
  'chicken pox',
  'a concussion',
  'appendicitis',
  'anxiety',
  'insomnia',
];

const OLDER_AILMENTS = [
  'high blood pressure',
  'arthritis',
  'sciatica',
  'gallstones',
  'hearing loss',
  'a bad hip',
  'type 2 diabetes',
  'depression',
];

/**
 * A job an NPC could plausibly hold. It comes out of the same career content the
 * player's own ladder does, so the world's jobs and the player's are the same
 * set of jobs — the alternative is a second, invented economy nobody can enter.
 */
const pickJob = (
  content: ContentPack,
  npc: Npc,
  rng: Rng,
): { title: string; employer: string; trackId: string } => {
  const tracks = [...content.careersById.values()].filter((t) => t.rungs.length > 0);
  const track = rng.pick(tracks);
  // Older people start further up; a 40-year-old is not a kitchen porter.
  const ceiling = npc.age < 25 ? 1 : npc.age < 35 ? 2 : 3;
  const rung = track.rungs[Math.min(track.rungs.length - 1, rng.int(0, ceiling))]!;
  return {
    title: rung.title,
    employer: npc.employerName ?? employerNameFor(track.industry, rng),
    trackId: track.id,
  };
};

/** The next rung on whatever ladder they are plausibly on. */
const promotionTitle = (content: ContentPack, npc: Npc): string | null => {
  for (const track of content.careersById.values()) {
    const index = track.rungs.findIndex((r) => r.title === npc.occupation);
    if (index >= 0 && index + 1 < track.rungs.length) return track.rungs[index + 1]!.title;
  }
  // They are on a ladder we cannot find — an arriving in-law with a hand-written
  // job, say. No promotion rather than an invented title.
  return null;
};

interface RelativeInput {
  sex: Sex;
  age: number;
  kind: RelationshipKind;
  lastName: string;
  parentNpcIds?: string[];
}

/**
 * A person who arrives because somebody else's life produced them. They are
 * full NPCs: they age, get ill, get jobs, and turn up in the log for decades.
 */
const spawnRelative = (
  state: LifeState,
  country: CountryPack,
  rng: Rng,
  input: RelativeInput,
): Npc => {
  const pool = input.sex === 'female' ? country.firstNames.female : country.firstNames.male;
  const taken = new Set(state.npcs.filter((n) => n.alive).map((n) => n.firstName));
  const free = pool.filter((name) => !taken.has(name));
  const firstName = rng.pick(free.length > 0 ? free : pool);

  const npc: Npc = {
    id: makeId('npc', state.seed, input.kind, state.character.age, state.npcs.length),
    firstName,
    lastName: input.lastName,
    sex: input.sex,
    age: Math.max(0, input.age),
    alive: true,
    avatarEmoji: input.age === 0 ? '👶' : input.sex === 'female' ? '👩' : '🧑',
    tier: 'tier2',
    descriptor: '',
    traitIds: [],
    occupation: null,
    cityId: state.character.cityId,
    stats: null,
    wealth: clampStat(30 + rng.int(0, 40)),
    isBloodline: false,
    parentNpcIds: input.parentNpcIds ?? [],
    ailments: [],
    retired: false,
    spouseNpcId: null,
    employerName: null,
  };

  // An adult who arrives already has a working life behind them.
  if (npc.age >= 22 && rng.chance(0.75)) {
    npc.occupation = rng.pick(ARRIVING_ADULT_JOBS);
  }

  const relationship: Relationship = {
    npcId: npc.id,
    kind: input.kind,
    formerKinds: [],
    dimensions: {
      affection: 50,
      trust: 50,
      respect: 50,
      conflict: 5,
      closeness: input.kind === 'niece_nephew' ? 55 : 42,
      romance: 0,
      dependence: 0,
    },
    sinceAge: state.character.age,
    lastContactAge: state.character.age,
    memories: [],
    onTheirMind: null,
    subtitle: '',
    band: 'around',
  };

  state.npcs.push(npc);
  state.relationships.push(relationship);
  return npc;
};

const ARRIVING_ADULT_JOBS = [
  'Insurance Agent',
  'Dental Hygienist',
  'Delivery Driver',
  'Line Cook',
  'Paralegal',
  'Nurse',
  'Electrician',
  'Bookkeeper',
  'Sales Associate',
  'Warehouse Picker',
];

const say = (state: LifeState, icon: string, line: string): void => {
  pushHistory(state, 'family', icon, line, 25);
};

/**
 * When a parent dies with something to leave, it is split between their children
 * and the log says the figure. An inheritance the player is not told about is
 * money appearing from nowhere, which is exactly the complaint that started this.
 */
export const inheritanceFrom = (
  state: LifeState,
  npc: Npc,
  rel: Relationship,
  rng: Rng,
): void => {
  if (rel.kind !== 'mother' && rel.kind !== 'father') return;
  const wealth = npc.wealth ?? 0;
  if (wealth < 35) return;

  const siblings = state.relationships.filter((r) => r.kind === 'sibling').length;
  /*
   * A parent's estate, from how well off they actually were. The old scale paid
   * out four figures on a comfortable parent, which is not an inheritance — it
   * is a rounding error, and it made the line read as filler.
   */
  const estate = Math.round((wealth - 30) * 4_000_00 * (0.6 + rng.next() * 0.8));
  const share = Math.round(estate / (siblings + 1));
  if (share < 50_00) return;

  state.character.finances.savings += share;
  pushHistory(
    state,
    'money',
    '📜',
    siblings > 0
      ? `You and your siblings each inherited ${formatMoneyExact(share)}.`
      : `You inherited ${formatMoneyExact(share)}.`,
    60,
  );
};
