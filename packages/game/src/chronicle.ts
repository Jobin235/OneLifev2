import type { GameConfig } from '@lineage/config';
import type { ChronicleLine, ContentPack } from '@lineage/content';
import type { LifeState, Npc, RelationshipKind } from '@lineage/shared-types';
import type { Rng } from '@lineage/simulation';
import { pushHistory } from './ageup.js';

/**
 * The texture of a year.
 *
 * A life made only of decisions reads like a questionnaire. Most of what happens
 * to a person is not a choice — a friend moves away, your mother mentions her
 * knee, the shop on the corner closes — and a year with none of that in it feels
 * empty even when something important happened.
 *
 * Chronicle lines are that texture: short, conditional, decision-free entries
 * that fill the log between events. They are deliberately cheap to author, so
 * there can be hundreds of them, and they name real NPCs so the texture is
 * continuous with the rest of the simulation rather than wallpaper.
 *
 * They never change state. Anything with a consequence is an event.
 */

/** The relationship kinds currently held by someone still alive. */
const livingKinds = (state: LifeState): RelationshipKind[] => {
  const alive = new Set(state.npcs.filter((n) => n.alive).map((n) => n.id));
  return state.relationships.filter((r) => alive.has(r.npcId)).map((r) => r.kind);
};

/** Facts a line can require or forbid, derived once per year. */
const tagsFor = (state: LifeState): Set<string> => {
  const c = state.character;
  const tags = new Set<string>();
  const add = (t: string, on: boolean) => {
    if (on) tags.add(t);
  };

  add('enrolled', state.education.current !== null);
  add('employed', state.career.current !== null);
  add('unemployed', state.career.current === null && !state.career.retired && c.age >= 22);
  add('retired', state.career.retired);
  add('incarcerated', c.record.incarceration !== null);
  add('has_business', state.businesses.length > 0);
  add('famous', c.fame.following > 0);

  const has = (...kinds: RelationshipKind[]) => livingKinds(state).some((k) => kinds.includes(k));
  add('has_partner', has('partner', 'spouse'));
  add('married', has('spouse'));
  add('has_friend', has('friend', 'best_friend'));
  add('has_children', has('child'));
  add('has_parent', has('mother', 'father'));
  add('has_sibling', has('sibling'));

  add('broke', c.finances.cash + c.finances.savings < 50_000);
  add('comfortable', c.finances.cash + c.finances.savings >= 500_000);
  add('wealthy', c.finances.cash + c.finances.savings >= 5_000_000);
  add('in_debt', c.finances.debt > 0);
  add('unwell', c.stats.health < 45);
  add('unhappy', c.stats.happiness < 35);
  add('content', c.stats.happiness >= 70);
  add('fit', c.stats.fitness >= 70);
  add('sharp', c.stats.smarts >= 70);
  return tags;
};

/** Which NPC, if any, a placeholder refers to. */
const RELATION_FOR: Record<string, RelationshipKind[]> = {
  friend: ['best_friend', 'friend'],
  partner: ['spouse', 'partner'],
  parent: ['mother', 'father'],
  sibling: ['sibling'],
  child: ['child'],
  colleague: ['colleague', 'boss'],
};

const PLACEHOLDER = /\{(friend|partner|parent|sibling|child|colleague)\}/g;

/**
 * Fills `{friend}` and friends with real people. Returns null when the line
 * needs someone the character does not have — better to skip a line than to
 * print "your friend" about nobody.
 */
const bindPeople = (
  line: ChronicleLine,
  state: LifeState,
  rng: Rng,
): { text: string; npcIds: string[] } | null => {
  const placeholders = [...new Set(line.text.match(PLACEHOLDER) ?? [])];
  if (placeholders.length === 0) return { text: line.text, npcIds: [] };

  const byId = new Map(state.npcs.map((n) => [n.id, n]));
  const used = new Map<string, Npc>();

  for (const token of placeholders) {
    const wanted = RELATION_FOR[token.slice(1, -1)] ?? [];
    const candidates = state.relationships
      .filter((r) => wanted.includes(r.kind))
      .map((r) => byId.get(r.npcId))
      .filter((n): n is Npc => !!n && n.alive && ![...used.values()].includes(n));
    if (candidates.length === 0) return null;
    used.set(token, rng.pick(candidates));
  }

  let text = line.text;
  for (const [token, npc] of used) text = text.replaceAll(token, npc.firstName);
  return { text, npcIds: [...used.values()].map((n) => n.id) };
};

const eligible = (line: ChronicleLine, state: LifeState, tags: Set<string>): boolean => {
  const age = state.character.age;
  if (age < line.minAge || age > line.maxAge) return false;
  if (line.requires.some((t) => !tags.has(t))) return false;
  if (line.forbids.some((t) => tags.has(t))) return false;
  return true;
};

/**
 * How full a year should feel. An ordinary adult year gets a couple of lines; a
 * year at school or in a first job gets more, because more is happening to you
 * and you are noticing more of it.
 */
const linesThisYear = (state: LifeState, tags: Set<string>, rng: Rng): number => {
  let n = 2;
  if (tags.has('enrolled')) n += 1;
  if (state.character.age <= 12) n += 1;
  if (tags.has('incarcerated')) n -= 1;
  if (state.character.age >= 75) n -= 1;
  return Math.max(1, Math.min(4, n + (rng.chance(0.35) ? 1 : 0)));
};

/**
 * Appends this year's texture to the log.
 *
 * Recently-used lines are suppressed so a life does not repeat itself: the same
 * observation twice in five years reads as a bug even when it is plausible.
 */
export const chronicleYear = (
  state: LifeState,
  content: ContentPack,
  _config: GameConfig,
  rng: Rng,
): void => {
  const tags = tagsFor(state);
  const age = state.character.age;

  const pool = content.chronicle.filter((line) => {
    if (!eligible(line, state, tags)) return false;
    const lastUsed = state.chronicleLog[line.id];
    return lastUsed === undefined || age - lastUsed >= line.cooldownYears;
  });
  if (pool.length === 0) return;

  const wanted = linesThisYear(state, tags, rng);
  const chosen: ChronicleLine[] = [];
  const remaining = [...pool];

  /*
   * Strongly prefer lines this life has never used.
   *
   * A pure weighted draw exhausts the small pool that fits any given year and
   * then cycles it, which over sixty years produced only ~60% distinct lines —
   * repetition a player reads as a bug, not as a life having patterns. Weighting
   * by how long ago a line was used spends the whole catalogue first.
   */
  const weightOf = (line: ChronicleLine): number => {
    const lastUsed = state.chronicleLog[line.id];
    if (lastUsed === undefined) return line.weight * 8;
    return line.weight * (1 + (age - lastUsed) / line.cooldownYears);
  };

  // Weighted draw without replacement, so one heavy line cannot fill a year.
  for (let i = 0; i < wanted && remaining.length > 0; i++) {
    const total = remaining.reduce((sum, l) => sum + weightOf(l), 0);
    let roll = rng.next() * total;
    let index = 0;
    for (; index < remaining.length - 1; index++) {
      roll -= weightOf(remaining[index]!);
      if (roll <= 0) break;
    }
    const [picked] = remaining.splice(index, 1);
    if (picked) chosen.push(picked);
  }

  for (const line of chosen) {
    const bound = bindPeople(line, state, rng);
    if (!bound) continue;
    state.chronicleLog[line.id] = age;
    pushHistory(state, line.category, line.icon, bound.text, 8, bound.npcIds);
  }
};
