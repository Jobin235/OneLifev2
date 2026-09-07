import type {
  CountryPack,
  LifeState,
  Npc,
  Relationship,
  RelationshipDimensions,
  RelationshipKind,
  Sex,
  TraitDefinition,
} from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { makeId, type Rng } from '@lineage/simulation';
import type { NpcTemplate } from './templates.js';
import { pickAvatar } from './avatars.js';

const DEFAULT_DIMENSIONS: RelationshipDimensions = {
  affection: 45,
  trust: 45,
  respect: 45,
  conflict: 5,
  closeness: 40,
  romance: 0,
  dependence: 0,
};

export interface SpawnInput {
  state: LifeState;
  template: NpcTemplate;
  country: CountryPack;
  traits: TraitDefinition[];
  rng: Rng;
  /** Forces a name, for content that needs a specific person. */
  firstName?: string;
  lastName?: string;
  sex?: Sex;
}

/**
 * Brings a new person into a life. They persist from here — design 3A introduces
 * Emma at 15 and the loop reuses her at 24, so nothing about a returning person is
 * regenerated.
 */
export const spawnNpc = (input: SpawnInput): { npc: Npc; relationship: Relationship } => {
  const { state, template, country, traits, rng } = input;
  const playerAge = state.character.age;

  const sex: Sex = input.sex ?? (rng.chance(0.5) ? 'male' : 'female');
  const firstName =
    input.firstName ??
    rng.pick(sex === 'female' ? country.firstNames.female : country.firstNames.male);
  const lastName = input.lastName ?? rng.pick(country.surnames);

  const [minOffset, maxOffset] = template.ageOffset;
  const age = Math.max(0, playerAge + rng.int(minOffset, maxOffset));

  const traitIds: string[] = [];
  for (const trait of rng.shuffle(traits)) {
    if (traitIds.length >= template.traitCount) break;
    if (trait.conflictsWith.some((id) => traitIds.includes(id))) continue;
    traitIds.push(trait.id);
  }

  const npc: Npc = {
    id: makeId('npc', state.seed, template.id, playerAge, state.npcs.length),
    firstName,
    lastName,
    sex,
    age,
    alive: true,
    avatarEmoji: pickAvatar(template.emojiPool, sex, rng),
    tier: template.detailed ? 'tier2' : 'tier3',
    descriptor: rng.pick(template.descriptors),
    traitIds,
    occupation: template.occupations.length > 0 ? rng.pick(template.occupations) : null,
    cityId: state.character.cityId,
    stats: template.detailed
      ? {
          health: clampStat(50 + rng.int(-20, 25)),
          happiness: clampStat(50 + rng.int(-20, 25)),
          smarts: clampStat(50 + rng.int(-25, 30)),
          fitness: clampStat(50 + rng.int(-25, 25)),
          charm: clampStat(50 + rng.int(-20, 30)),
        }
      : null,
    wealth: template.detailed ? clampStat(40 + rng.int(-25, 35)) : null,
    isBloodline: false,
    parentNpcIds: [],
    ailments: [],
    retired: false,
    spouseNpcId: null,
    employerName: null,
  };

  const dimensions: RelationshipDimensions = { ...DEFAULT_DIMENSIONS };
  for (const [key, value] of Object.entries(template.dimensions)) {
    if (key in dimensions) {
      dimensions[key as keyof RelationshipDimensions] = clampStat(Number(value) + rng.int(-8, 8));
    }
  }

  const relationship: Relationship = {
    npcId: npc.id,
    kind: template.kind as RelationshipKind,
    formerKinds: [],
    dimensions,
    sinceAge: playerAge,
    lastContactAge: playerAge,
    memories: [],
    onTheirMind: null,
    subtitle: '',
    band: 'around',
  };

  state.npcs.push(npc);
  state.relationships.push(relationship);
  return { npc, relationship };
};

/**
 * A child inherits from both parents and then diverges. Design 5G: "Each one has
 * real stats you influence but don't control."
 */
export const bearChild = (
  state: LifeState,
  country: CountryPack,
  rng: Rng,
  firstName?: string,
): { npc: Npc; relationship: Relationship } => {
  const sex: Sex = rng.chance(0.5) ? 'male' : 'female';
  const partner = state.relationships.find((r) => r.kind === 'spouse' || r.kind === 'partner');
  const partnerNpc = partner ? state.npcs.find((n) => n.id === partner.npcId) : undefined;

  const inherit = (mine: number, theirs: number | undefined): number =>
    clampStat((mine + (theirs ?? 50)) / 2 + rng.int(-18, 18));

  const parentStats = state.character.stats;
  const otherStats = partnerNpc?.stats ?? null;

  const npc: Npc = {
    id: makeId('npc', state.seed, 'child', state.character.age, state.npcs.length),
    firstName:
      firstName ?? rng.pick(sex === 'female' ? country.firstNames.female : country.firstNames.male),
    lastName: state.character.lastName,
    sex,
    age: 0,
    alive: true,
    avatarEmoji: sex === 'female' ? '👧' : '👦',
    tier: 'tier1',
    descriptor: rng.pick(CHILD_DESCRIPTORS),
    traitIds: [],
    occupation: null,
    cityId: state.character.cityId,
    stats: {
      health: inherit(parentStats.health, otherStats?.health),
      happiness: inherit(parentStats.happiness, otherStats?.happiness),
      smarts: inherit(parentStats.smarts, otherStats?.smarts),
      fitness: inherit(parentStats.fitness, otherStats?.fitness),
      charm: inherit(parentStats.charm, otherStats?.charm),
    },
    wealth: null,
    isBloodline: true,
    parentNpcIds: partnerNpc ? [partnerNpc.id] : [],
    ailments: [],
    retired: false,
    spouseNpcId: null,
    employerName: null,
  };

  const relationship: Relationship = {
    npcId: npc.id,
    kind: 'child',
    formerKinds: [],
    dimensions: {
      affection: 90,
      trust: 85,
      respect: 60,
      conflict: 0,
      closeness: 90,
      romance: 0,
      dependence: 100,
    },
    sinceAge: state.character.age,
    lastContactAge: state.character.age,
    memories: [],
    onTheirMind: null,
    subtitle: '',
    band: 'close',
  };

  state.npcs.push(npc);
  state.relationships.push(relationship);
  return { npc, relationship };
};

const CHILD_DESCRIPTORS = [
  'Quick, stubborn, keeps score',
  'Quiet, watchful, cries at unfairness',
  'Loud, funny, never still',
  'Careful with everything, including you',
  'Sweet-natured and completely unbothered',
  'Sharp, and already argues like a lawyer',
];
