import type { GameConfig } from '@lineage/config';
import type {
  Character,
  CountryPack,
  Lineage,
  LifeState,
  Npc,
  Relationship,
  RelationshipDimensions,
  Sex,
  Stats,
  TraitDefinition,
  Upbringing,
} from '@lineage/shared-types';
import { SCHEMA_VERSION, clampStat } from '@lineage/shared-types';
import { makeId, makeRng, type Rng } from './rng.js';
import { refreshDerived } from './relationships.js';

export interface CreateLifeInput {
  lifeId: string;
  seed: string;
  firstName?: string;
  lastName?: string;
  sex?: Sex;
  country: CountryPack;
  cityId?: string;
  upbringing: Upbringing;
  traits: TraitDefinition[];
  birthYear: number;
  contentVersion: number;
  /** Present when continuing a family line rather than starting fresh. */
  lineage?: Lineage;
}

/** Design 4A: three starts, and none of them is a character sheet. */
const UPBRINGING_PROFILE: Record<
  Upbringing,
  { wealth: number; statBias: Partial<Stats>; siblingBias: number; blurb: string }
> = {
  rough: {
    wealth: 0.25,
    statBias: { happiness: -6, charm: 2, fitness: 4, health: -3 },
    siblingBias: 1,
    blurb: 'Less money, more grit.',
  },
  getting_by: {
    wealth: 1,
    statBias: {},
    siblingBias: 0,
    blurb: 'Two parents, one income, a small house.',
  },
  comfortable: {
    wealth: 3.2,
    statBias: { smarts: 6, happiness: 4, health: 3, charm: 3 },
    siblingBias: -1,
    blurb: 'Money, expectations, and a family name.',
  },
};

const rollStat = (rng: Rng): number => clampStat(35 + rng.int(0, 30) + rng.int(0, 30));

const emptyDimensions = (overrides: Partial<RelationshipDimensions> = {}): RelationshipDimensions => ({
  affection: 50,
  trust: 50,
  respect: 50,
  conflict: 5,
  closeness: 50,
  romance: 0,
  dependence: 0,
  ...overrides,
});

/**
 * Two people in the same house should not share a first name. Families in this
 * game are small enough that a collision reads as a bug rather than a coincidence.
 */
const pickName = (country: CountryPack, sex: Sex, rng: Rng, taken: Set<string> = new Set()): string => {
  const pool = sex === 'female' ? country.firstNames.female : country.firstNames.male;
  const free = pool.filter((name) => !taken.has(name));
  const chosen = rng.pick(free.length > 0 ? free : pool);
  taken.add(chosen);
  return chosen;
};

const childAvatar = (sex: Sex): string => (sex === 'female' ? '👧' : '👦');

/**
 * A newborn, their family, and nothing else. The character starts at age 0 —
 * design 4A: "You'll start at birth and find out the rest as you go."
 */
export const createLife = (input: CreateLifeInput, config: GameConfig): LifeState => {
  const rng = makeRng(input.seed, 'creation');
  const profile = UPBRINGING_PROFILE[input.upbringing];

  const usedNames = new Set<string>();
  const sex: Sex = input.sex ?? (rng.chance(0.5) ? 'male' : 'female');
  const lastName = input.lastName ?? input.lineage?.familyName ?? rng.pick(input.country.surnames);
  const firstName = input.firstName ?? pickName(input.country, sex, rng, usedNames);
  usedNames.add(firstName);
  const city = input.country.cities.find((c) => c.id === input.cityId) ?? rng.pick(input.country.cities);

  const stats: Stats = {
    health: rollStat(rng),
    happiness: rollStat(rng),
    smarts: rollStat(rng),
    fitness: rollStat(rng),
    charm: rollStat(rng),
  };
  for (const [key, bias] of Object.entries(profile.statBias)) {
    stats[key as keyof Stats] = clampStat(stats[key as keyof Stats] + (bias ?? 0));
  }

  // Two or three traits, never conflicting ones.
  const traitIds: string[] = [];
  const pool = rng.shuffle(input.traits);
  for (const trait of pool) {
    if (traitIds.length >= (rng.chance(0.4) ? 3 : 2)) break;
    if (trait.conflictsWith.some((id) => traitIds.includes(id))) continue;
    traitIds.push(trait.id);
    for (const [stat, bias] of Object.entries(trait.statBias)) {
      if (stat in stats) stats[stat as keyof Stats] = clampStat(stats[stat as keyof Stats] + bias);
    }
  }

  const character: Character = {
    id: makeId('chr', input.seed, 'self'),
    firstName,
    lastName,
    sex,
    age: 0,
    birthYear: input.birthYear,
    countryId: input.country.id,
    cityId: city.id,
    alive: true,
    deathAge: null,
    causeOfDeath: null,
    avatarEmoji: '👶',
    stats,
    hidden: {
      discipline: rollStat(rng),
      creativity: rollStat(rng),
      luck: rollStat(rng),
    },
    traitIds,
    finances: {
      cash: 0,
      savings: 0,
      investments: 0,
      debt: 0,
    debts: [],
      salary: 0,
      otherIncome: 0,
      // Recomputed every year by updateCostOfLiving; a newborn owes nothing.
      annualExpenses: 0,
    },
    fame: { knownFor: null, following: 0, fans: 0, indifferent: 100, haters: 0, reach: 'none' },
    record: { convictions: [], incarceration: null },
    conditions: [],
    habitIds: [],
  };

  const npcs: Npc[] = [];
  const relationships: Relationship[] = [];

  const addFamily = (
    kind: Relationship['kind'],
    npcSex: Sex,
    age: number,
    descriptor: string,
    emoji: string,
    dims: Partial<RelationshipDimensions>,
    occupation: string | null,
  ): Npc => {
    const npc: Npc = {
      id: makeId('npc', input.seed, kind, npcs.length),
      firstName: pickName(input.country, npcSex, rng, usedNames),
      lastName,
      sex: npcSex,
      age,
      alive: true,
      avatarEmoji: emoji,
      tier: 'tier1',
      descriptor,
      traitIds: [rng.pick(input.traits).id],
      occupation,
      cityId: city.id,
      stats: null,
      wealth: clampStat(30 + profile.wealth * 12 + rng.int(0, 20)),
      isBloodline: kind === 'sibling',
      parentNpcIds: [],
      ailments: [],
      retired: false,
      spouseNpcId: null,
      employerName: null,
    };
    npcs.push(npc);
    relationships.push({
      npcId: npc.id,
      kind,
      formerKinds: [],
      dimensions: emptyDimensions(dims),
      sinceAge: 0,
      lastContactAge: 0,
      memories: [],
      onTheirMind: null,
      subtitle: '',
      band: 'close',
    });
    return npc;
  };

  // A "rough start" is materially more likely to mean one parent.
  const twoParents = input.upbringing === 'rough' ? rng.chance(0.55) : rng.chance(0.88);

  addFamily(
    'mother',
    'female',
    rng.int(21, 38),
    'Practical, tired, does not say much',
    '👩',
    { affection: 78, trust: 76, closeness: 82 },
    null,
  );
  if (twoParents) {
    addFamily(
      'father',
      'male',
      rng.int(22, 42),
      'Mentions important things casually, at 11pm',
      '👨',
      { affection: 70, trust: 68, closeness: 72 },
      null,
    );
  }

  const siblingCount = Math.max(
    0,
    Math.min(4, input.country.family.typicalSiblings + profile.siblingBias + rng.int(-1, 1)),
  );
  for (let i = 0; i < siblingCount; i++) {
    const siblingSex: Sex = rng.chance(0.5) ? 'male' : 'female';
    addFamily(
      'sibling',
      siblingSex,
      rng.int(-6, 6) || 2,
      'Grew up in the same house, remembers it differently',
      childAvatar(siblingSex),
      { affection: 62, trust: 60, closeness: 66, conflict: rng.int(5, 30) },
      null,
    );
  }
  // Siblings born after the player are handled as negative ages at creation; clamp.
  for (const npc of npcs) if (npc.age < 0) npc.age = 0;

  const lineage: Lineage = input.lineage ?? {
    id: makeId('lin', input.seed, 'lineage'),
    familyName: lastName,
    generation: 1,
    ancestors: [],
    heirlooms: [],
    institutions: [],
  };

  const state: LifeState = {
    id: input.lifeId,
    seed: input.seed,
    step: 0,
    schemaVersion: SCHEMA_VERSION,
    contentVersion: input.contentVersion,
    lineage,
    character,
    npcs,
    relationships,
    career: { current: null, totalExperience: 0, retired: false, history: [], closedTrackIds: [] },
    education: { highestCompleted: 'none', current: null, history: [] },
    /*
     * Set later, if at all: a royal birth needs the country pack, which this
     * layer does not hold. `packages/game/src/royalty.ts` decides it at the
     * first age-up, before the character is old enough for it to matter.
     */
    royal: null,
    assets: [],
    businesses: [],
    flags: {
      upbringing: input.upbringing,
      family_wealth: profile.wealth,
      birth_country: input.country.id,
      // So content can write "{city}" and get "Portland" rather than "portland".
      city_name: city.name,
    },
    history: [
      {
        id: makeId('his', input.seed, 'birth'),
        atAge: 0,
        category: 'family',
        icon: '👶',
        line: `You were born in ${city.name}. ${profile.blurb}`,
        significance: 100,
        eventInstanceId: null,
        npcIds: npcs.map((n) => n.id),
      },
    ],
    currentYearEntryIds: [],
    gameState: 'IDLE',
    activeEvent: null,
    resolvedEvent: null,
    pending: [],
    eventLog: {},
    categoryLog: {},
    activityUsage: {},
    chronicleLog: {},
    interactionUsage: {},
    portfolio: [],
    ribbonsEarned: [],
    fated: [],
    yearsOutOfWork: 0,
    struggling: false,
    struggleYears: 0,
    applicationsThisYear: 0,
    lastSeenWorldSnapshotId: null,
    lastReturnEventAt: null,
    legacy: null,
  };
  state.currentYearEntryIds = [state.history[0]!.id];

  refreshDerived(state, config);
  return state;
};
