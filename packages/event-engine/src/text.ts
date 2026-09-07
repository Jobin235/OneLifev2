import type { LifeState } from '@lineage/shared-types';
import { formatMoneyExact } from '@lineage/simulation';

/**
 * Content writes `{partner}` and `{business}` rather than "your partner", because
 * design 2A's whole point is that these are named people and named things.
 *
 * A token that cannot be resolved falls back to a neutral phrase rather than
 * appearing raw. An optional participant who does not exist in this life is a
 * normal occurrence, not a content bug, and the player must never see "{friend}".
 */
export const interpolate = (
  template: string,
  state: LifeState,
  bindings: Record<string, string>,
): string => {
  const filled = template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_whole, token: string) => {
    const value = lookup(token, state, bindings);
    return value ?? fallbackFor(token);
  });
  return capitaliseSentences(filled);
};

/**
 * A pronoun token at the start of a sentence resolves to "he" or "she", which
 * then reads as "he said yes, and then cried". Fixing this in the writing would
 * mean every author remembering never to open a sentence with a role token —
 * so it is fixed here instead, once.
 *
 * Only a lowercase letter immediately after sentence-ending punctuation or at the
 * very start is touched, so nothing else in the prose is disturbed.
 */
const capitaliseSentences = (text: string): string =>
  text
    .replace(/^(\s*["“'(]?)([a-z])/, (_m, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(
      /([.!?])(\s+["“'(]?)([a-z])/g,
      (_m, punct: string, gap: string, letter: string) => punct + gap + letter.toUpperCase(),
    );

const ROLE_FALLBACKS: Record<string, string> = {
  friend: 'someone you know',
  partner: 'the person you were seeing',
  boss: 'your manager',
  rival: 'someone else',
  parent: 'your parent',
  mother: 'your mother',
  father: 'your father',
  sibling: 'your sibling',
  child: 'your kid',
  kid_a: 'one of your kids',
  kid_b: 'the other one',
  who: 'someone close to you',
  business: 'the company',
  employer: 'work',
  school: 'school',
};

const fallbackFor = (token: string): string => {
  const [head, tail] = token.split('.');
  if (!head) return 'them';
  if (tail === 'they') return 'they';
  if (tail === 'them') return 'them';
  if (tail === 'their') return 'their';
  if (tail === 'full') return ROLE_FALLBACKS[head] ?? 'them';
  return ROLE_FALLBACKS[head] ?? 'them';
};

const lookup = (
  token: string,
  state: LifeState,
  bindings: Record<string, string>,
): string | null => {
  const [head, tail] = token.split('.');
  if (!head) return null;

  if (head === 'me') return state.character.firstName;
  if (head === 'surname') return state.character.lastName;
  if (head === 'age') return String(state.character.age);
  /*
   * The name, not the id. `{city}` used to render "portland", which reads as a
   * database key leaking into the prose — and it would have, the first time a
   * line used it.
   */
  if (head === 'city') return state.flags.city_name ? String(state.flags.city_name) : null;

  if (head === 'business') {
    const business = state.businesses.find((b) => !b.closed);
    if (!business) return null;
    if (tail === 'units') return `${business.units} ${business.unitLabel}`;
    if (tail === 'employees') return String(business.employees);
    return business.name;
  }

  if (head === 'employer') return state.career.current?.employerName ?? null;
  if (head === 'title') return state.career.current?.title ?? null;
  if (head === 'school') return state.education.current?.institutionName ?? null;

  if (head === 'cash') return formatMoneyExact(state.character.finances.cash);
  if (head === 'salary') return formatMoneyExact(state.character.finances.salary);

  // Otherwise the token is a participant role, or a relationship kind.
  const npcId = bindings[head];
  const rel = npcId
    ? state.relationships.find((r) => r.npcId === npcId)
    : state.relationships.find((r) => r.kind === head);
  if (!rel) return null;
  const npc = state.npcs.find((n) => n.id === rel.npcId);
  if (!npc) return null;

  if (tail === 'full') return `${npc.firstName} ${npc.lastName}`;
  if (tail === 'age') return String(npc.age);
  if (tail === 'they') return npc.sex === 'female' ? 'she' : 'he';
  if (tail === 'them') return npc.sex === 'female' ? 'her' : 'him';
  if (tail === 'their') return npc.sex === 'female' ? 'her' : 'his';
  if (tail === 'job') return npc.occupation ?? null;
  return npc.firstName;
};
