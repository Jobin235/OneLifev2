import type { GameConfig } from '@lineage/config';
import type {
  ClosenessBand,
  LifeState,
  Memory,
  Npc,
  Relationship,
  RelationshipKind,
} from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { formatMoneyExact } from './money.js';

const FAMILY_KINDS: ReadonlySet<RelationshipKind> = new Set([
  'mother',
  'father',
  'sibling',
  'child',
  'grandparent',
  'grandchild',
  'spouse',
  'niece_nephew',
]);

/**
 * The single number shown next to a person on design 2A. Romance dominates for a
 * partner, conflict subtracts everywhere, and family gets a floor — you can be on
 * bad terms with your mother without her leaving the list.
 */
export const surfacedScore = (rel: Relationship): number => {
  const d = rel.dimensions;
  const romantic = rel.kind === 'partner' || rel.kind === 'spouse';
  const core = romantic
    ? d.romance * 0.5 + d.affection * 0.3 + d.trust * 0.2
    : d.closeness * 0.4 + d.affection * 0.35 + d.trust * 0.25;
  const score = clampStat(core - d.conflict * 0.35);
  return FAMILY_KINDS.has(rel.kind) ? Math.max(score, 8) : score;
};

export const bandFor = (rel: Relationship, config: GameConfig): ClosenessBand => {
  const score = surfacedScore(rel);
  if (score >= config.relationships.closeThreshold) return 'close';
  /*
   * Family does not drift out of your life the way an acquaintance does.
   *
   * Contact decay pushed every sibling and parent to "drifted" by mid-life,
   * which is not what happens to families and had a consequence beyond the
   * people list: the band decides how much of somebody's year you hear about,
   * so a character's own brother could get married, have two children and
   * retire without the log mentioning any of it.
   */
  if (score < config.relationships.driftedThreshold) {
    return FAMILY_KINDS.has(rel.kind) ? 'around' : 'drifted';
  }
  return 'around';
};

const KIND_LABEL: Record<RelationshipKind, string> = {
  mother: 'Mom',
  father: 'Dad',
  sibling: 'Sibling',
  child: 'Child',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  spouse: 'Husband/Wife',
  partner: 'Partner',
  ex: 'Ex',
  friend: 'Friend',
  best_friend: 'Best friend',
  classmate: 'Classmate',
  teacher: 'Teacher',
  colleague: 'Coworker',
  boss: 'Your manager',
  employee: 'Works for you',
  business_partner: 'Business partner',
  rival: 'Rival',
  acquaintance: 'Acquaintance',
  cellmate: 'Cellmate',
  in_law: 'In-law',
  niece_nephew: 'Niece/Nephew',
};

export const relationshipLabel = (rel: Relationship, npc: Npc, sexAware = true): string => {
  if (rel.kind === 'spouse') return sexAware && npc.sex === 'female' ? 'Wife' : 'Husband';
  if (rel.kind === 'partner') return sexAware && npc.sex === 'female' ? 'Girlfriend' : 'Boyfriend';
  if (rel.kind === 'child') return sexAware && npc.sex === 'female' ? 'Daughter' : 'Son';
  if (rel.kind === 'sibling') return sexAware && npc.sex === 'female' ? 'Sister' : 'Brother';
  if (rel.kind === 'niece_nephew') return sexAware && npc.sex === 'female' ? 'Niece' : 'Nephew';
  return KIND_LABEL[rel.kind];
};

/**
 * How the log refers to somebody: "Your big sister, Aretha", "Your mother",
 * "Johnny McCoy".
 *
 * The relation is restated on every single line a person appears in, which is
 * the trick that lets a life carry forty named people without a directory
 * screen — you are never asked to remember who Aretha is. Family gets the
 * relation and a first name; everyone else gets their full name, because
 * "Your acquaintance, Dave" is not a sentence anybody says.
 *
 * Second person throughout, because that is the voice every other line in this
 * game is written in. BitLife's log is a first-person diary; ours is not, and
 * mixing "Your mother" with "I graduated" would read as two narrators.
 */
export const narrativeName = (
  rel: Relationship,
  npc: Npc,
  playerAge: number,
  state?: { npcs: Npc[] },
): string => {
  const term = familyTerm(rel, npc, playerAge);
  return term ? `Your ${term}, ${nameIn(npc, state)}` : `${npc.firstName} ${npc.lastName}`;
};

/**
 * A first name, unless somebody else alive is using it.
 *
 * Name pools are finite and a long life outgrows them, so two nephews really can
 * both be called Dean. When that happens the log has to say which one, or the
 * same sentence appears twice and reads as a bug rather than as a coincidence.
 */
const nameIn = (npc: Npc, state?: { npcs: Npc[] }): string => {
  if (!state) return npc.firstName;
  const clash = state.npcs.some(
    (other) => other.id !== npc.id && other.alive && other.firstName === npc.firstName,
  );
  return clash ? `${npc.firstName} ${npc.lastName}` : npc.firstName;
};

/**
 * The same phrase, punctuated to lead a sentence. An appositive has to be closed
 * — "Your mother, Iris, retired" — and a bare full name must not be, so the
 * comma belongs to the phrase rather than to every caller that writes one.
 */
export const narrativeSubject = (
  rel: Relationship,
  npc: Npc,
  playerAge: number,
  state?: { npcs: Npc[] },
): string => {
  const term = familyTerm(rel, npc, playerAge);
  return term ? `Your ${term}, ${nameIn(npc, state)},` : `${npc.firstName} ${npc.lastName}`;
};

/** Just the relation, for lines that do not need the name: "Your mother". */
export const narrativeTerm = (rel: Relationship, npc: Npc, playerAge: number): string => {
  const term = familyTerm(rel, npc, playerAge);
  return term ? `Your ${term}` : `${npc.firstName} ${npc.lastName}`;
};

const familyTerm = (rel: Relationship, npc: Npc, playerAge: number): string | null => {
  switch (rel.kind) {
    case 'mother':
      return 'mother';
    case 'father':
      return 'father';
    // Older or younger matters to how a sibling is spoken about, and it is the
    // one relation where the game already knows the answer.
    case 'sibling':
      return npc.age > playerAge
        ? npc.sex === 'female'
          ? 'big sister'
          : 'big brother'
        : npc.sex === 'female'
          ? 'little sister'
          : 'little brother';
    case 'child':
      return npc.sex === 'female' ? 'daughter' : 'son';
    case 'spouse':
      return npc.sex === 'female' ? 'wife' : 'husband';
    case 'partner':
      return npc.sex === 'female' ? 'girlfriend' : 'boyfriend';
    case 'grandparent':
      return npc.sex === 'female' ? 'grandmother' : 'grandfather';
    case 'grandchild':
      return npc.sex === 'female' ? 'granddaughter' : 'grandson';
    case 'niece_nephew':
      return npc.sex === 'female' ? 'niece' : 'nephew';
    case 'boss':
      return 'supervisor';
    case 'cellmate':
      return 'cellmate';
    case 'classmate':
      return 'classmate';
    default:
      return null;
  }
};

/**
 * Design 2A: "each subtitle carries a fact rather than a label — 'owes you $2,500',
 * 'wants your job'. That's what makes the list feel like people instead of a
 * contacts app."
 *
 * So the subtitle is the heaviest unresolved memory when there is one, and falls
 * back to the relationship's shape only when the person has no story yet.
 */
export const deriveSubtitle = (
  rel: Relationship,
  npc: Npc,
  playerAge: number,
  config: GameConfig,
): string => {
  const label = relationshipLabel(rel, npc);

  const fact = [...rel.memories]
    .filter((m) => !m.resolved && m.weight >= config.relationships.memoryDisplayThreshold)
    .sort((a, b) => b.weight - a.weight || b.atAge - a.atAge)[0];

  const factText = fact ? subtitleFromMemory(fact) : null;
  if (factText) return `${label} · ${factText}`;

  const years = playerAge - rel.sinceAge;
  if ((rel.kind === 'partner' || rel.kind === 'spouse') && years >= 1) {
    return `${label} · ${years} year${years === 1 ? '' : 's'}`;
  }
  if (rel.kind === 'mother' || rel.kind === 'father') {
    return `${label} · ${npc.age}`;
  }
  if (rel.kind === 'child') return `${label} · ${npc.age}`;
  if (npc.occupation) return `${label} · ${npc.occupation}`;
  return label;
};

/** Only some facts read well as a subtitle; the rest stay on the person's screen. */
const subtitleFromMemory = (memory: Memory): string | null => {
  const amount = typeof memory.data.amount === 'number' ? memory.data.amount : null;
  switch (memory.factKey) {
    case 'owes_you_money':
      return amount ? `owes you ${formatMoneyExact(amount)}` : 'owes you money';
    case 'you_owe_them_money':
      return amount ? `you owe them ${formatMoneyExact(amount)}` : 'you owe them';
    case 'wants_your_job':
      return 'wants your job';
    case 'no_longer_speaks_to_you':
      return "you don't talk";
    case 'you_took_their_place':
      return 'you took his spot';
    case 'knew_you_at_school':
      return 'knew you at 15';
    case 'lives_with_you':
      return 'lives with you';
    default:
      return null;
  }
};

/**
 * A year of not calling someone. Family holds on longer than friends; a person in
 * the "drifted" band keeps drifting, which is how design 2A's "5 people you've lost
 * touch with" fills up without anyone deciding to lose them.
 */
export const decayRelationships = (state: LifeState, config: GameConfig): void => {
  const { decayPerYear, familyDecayMultiplier } = config.relationships;
  const age = state.character.age;

  for (const rel of state.relationships) {
    /*
     * Living with someone counts as contact, and time spent together warms a
     * relationship rather than leaving it flat. Without this, a partnership can
     * only ever be damaged by events and never deepened by simply lasting — so
     * nobody ever gets close enough to be proposed to.
     */
    if (livesWithYou(state, rel)) {
      rel.lastContactAge = age;
      const warmth = rel.dimensions.conflict > 45 ? 0 : 2.5;
      if (warmth > 0) {
        const d = rel.dimensions;
        d.closeness = clampStat(d.closeness + warmth);
        d.affection = clampStat(d.affection + warmth * 0.8);
        d.trust = clampStat(d.trust + warmth * 0.6);
        if (rel.kind === 'partner' || rel.kind === 'spouse') {
          d.romance = clampStat(d.romance + warmth * 0.9);
        }
      }
      d_conflictCool(rel);
      continue;
    }

    // A partner you are not living with still grows, just more slowly.
    if (rel.kind === 'partner' && age - rel.lastContactAge <= 1) {
      const d = rel.dimensions;
      d.romance = clampStat(d.romance + 1.6);
      d.closeness = clampStat(d.closeness + 1.2);
      d.affection = clampStat(d.affection + 1.2);
      rel.lastContactAge = age;
      d_conflictCool(rel);
      continue;
    }

    const yearsSinceContact = age - rel.lastContactAge;
    if (yearsSinceContact <= 0) continue;

    const multiplier = FAMILY_KINDS.has(rel.kind) ? familyDecayMultiplier : 1;
    const amount = decayPerYear * multiplier * Math.min(3, yearsSinceContact);

    const d = rel.dimensions;
    d.closeness = clampStat(d.closeness - amount);
    d.affection = clampStat(d.affection - amount * 0.7);
    if (rel.kind === 'partner' || rel.kind === 'spouse') {
      d.romance = clampStat(d.romance - amount * 0.5);
    }
    // Old conflicts cool off even when nothing is repaired.
    d.conflict = clampStat(d.conflict - 1.5);
  }
};

export const refreshDerived = (state: LifeState, config: GameConfig): void => {
  const npcById = new Map(state.npcs.map((n) => [n.id, n]));
  for (const rel of state.relationships) {
    const npc = npcById.get(rel.npcId);
    if (!npc) continue;
    rel.band = bandFor(rel, config);
    rel.subtitle = deriveSubtitle(rel, npc, state.character.age, config);
    npc.tier = rel.band === 'close' ? 'tier1' : rel.band === 'around' ? 'tier2' : 'tier3';
  }
};

/** Old conflicts cool off on their own, whether or not anything is repaired. */
const d_conflictCool = (rel: Relationship): void => {
  rel.dimensions.conflict = clampStat(rel.dimensions.conflict - 1.5);
};

const livesWithYou = (state: LifeState, rel: Relationship): boolean => {
  if (rel.kind === 'spouse') return true;
  if (rel.kind === 'partner' && state.flags.cohabiting === true) return true;
  if (rel.kind === 'child') {
    const npc = state.npcs.find((n) => n.id === rel.npcId);
    return !!npc && npc.age < 19;
  }
  // Still at home with your parents.
  if ((rel.kind === 'mother' || rel.kind === 'father') && state.character.age < 19) return true;
  return hasMemory(rel, 'lives_with_you');
};

export const findRelationship = (state: LifeState, npcId: string): Relationship | undefined =>
  state.relationships.find((r) => r.npcId === npcId);

export const relationshipsOfKind = (state: LifeState, ...kinds: RelationshipKind[]): Relationship[] => {
  const wanted = new Set(kinds);
  return state.relationships.filter((r) => wanted.has(r.kind));
};

export const hasMemory = (rel: Relationship, factKey: string, includeResolved = false): boolean =>
  rel.memories.some((m) => m.factKey === factKey && (includeResolved || !m.resolved));

/** Memories the person screen shows, newest last, capped (design 2B). */
export const displayMemories = (
  rel: Relationship,
  config: GameConfig,
  /*
   * Everything, for somebody who is gone.
   *
   * The threshold exists so a living person's page shows what stands out rather
   * than a transcript. For the dead there is nothing else — the page *is* the
   * transcript, and a father whose memories all fell under the bar had a page
   * with nothing on it at all.
   */
  keepEverything = false,
): Memory[] =>
  [...rel.memories]
    .filter((m) => keepEverything || m.weight >= config.relationships.memoryDisplayThreshold)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, keepEverything ? 24 : config.relationships.maxDisplayedMemories)
    .sort((a, b) => a.atAge - b.atAge);
