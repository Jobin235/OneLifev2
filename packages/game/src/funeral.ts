import type { ContentPack } from '@lineage/content';
import type { LifeState, Npc, Relationship } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { instantiate } from '@lineage/event-engine';
import { narrativeTerm } from '@lineage/simulation';

/**
 * Somebody is gone, and the game stops.
 *
 * A death used to be a line: "Your mother died in her sleep." The log moved on,
 * the year moved on, and the largest thing that can happen to a person got the
 * same weight as a promotion at work. BitLife stops and asks, and it is right
 * to — not because attending a funeral is an interesting optimisation, but
 * because being asked is what makes it land.
 *
 * The decision is deliberately not a good one. Grief is not optional and no
 * answer avoids it; what the answers differ on is what the *rest* of the family
 * takes away. Staying home is the cheapest thing to do this year and the most
 * expensive thing to have done, which is the only shape this decision can
 * honestly have.
 */
export const openFuneral = (
  state: LifeState,
  npc: Npc,
  relationship: Relationship,
  manner: string,
  content: ContentPack,
): boolean => {
  const definition = content.eventsById.get('family_funeral');
  if (!definition) return false;

  const term = narrativeTerm(relationship, npc, state.character.age);
  const years = Math.max(0, state.character.age - relationship.sinceAge);
  /*
   * "Your whole life" is a claim about when the relationship *started*, not
   * about how long it ran. A forty-year marriage is not your whole life, and
   * saying so of a wife you met at thirty reads as the game not knowing who it
   * is talking about.
   */
  const bornInto = relationship.sinceAge === 0;
  const known = bornInto
    ? 'You had known them your whole life.'
    : years >= 25
      ? `You had known them most of your life — ${years} years of it.`
      : years >= 8
        ? `You had known them ${years} years.`
        : years >= 2
          ? `You had only known them ${years} years, which is its own kind of unfair.`
          : 'You barely got the chance to know them.';

  state.flags.funeral_who = term;
  state.flags.funeral_name = `${npc.firstName} ${npc.lastName}`;
  state.flags.funeral_body = `${term} died ${manner}. ${known}\n\nThere is a date and a church and a list of people who will notice who came.`;
  state.flags.funeral_npc = npc.id;

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);

  instance.facts = [
    { label: 'Age', value: `${npc.age}` },
    { label: 'Known', value: years >= 1 ? `${years} years` : 'Not long' },
  ];

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  return true;
};

/**
 * What going, or not going, does.
 *
 * `going` is whether they were in the room; `spoke` is whether they stood up.
 * The people who register it are the ones the dead person also belonged to —
 * the surviving family — which is why not going costs standing with a set of
 * people who were not the one who died.
 */
export const settleFuneral = (state: LifeState, going: boolean, spoke: boolean): void => {
  const npcId = String(state.flags.funeral_npc ?? '');
  const term = String(state.flags.funeral_who ?? 'They');
  const dead = state.npcs.find((n) => n.id === npcId);
  const stats = state.character.stats;

  /*
   * Grief is not a choice, so it is not in the branches. Standing up to speak
   * costs more of it on the day and gives it somewhere to go afterwards; not
   * going costs the least right now, which is exactly why people do it.
   */
  const grief = spoke ? -14 : going ? -11 : -7;
  stats.happiness = clampStat(stats.happiness + grief);

  const witnessed = spoke ? 6 : going ? 3 : -9;
  let noticed = 0;
  for (const rel of state.relationships) {
    if (rel.npcId === npcId) continue;
    const other = state.npcs.find((n) => n.id === rel.npcId);
    if (!other?.alive) continue;
    // The people who share the dead person: their family is your family.
    if (!SHARES_A_FUNERAL.has(rel.kind)) continue;
    rel.dimensions.affection = clampStat(rel.dimensions.affection + witnessed);
    rel.dimensions.respect = clampStat(rel.dimensions.respect + witnessed);
    noticed += 1;
  }

  state.character.karma = Math.max(-100, Math.min(100, state.character.karma + (going ? 2 : -5)));

  if (dead) {
    // So the person is still somebody the game can talk about afterwards.
    state.flags[`mourned_${npcId}`] = going ? (spoke ? 'spoke' : 'attended') : 'stayed away';
  }

  /*
   * Named, because a long life goes to several of these and "You spoke at the
   * funeral" three years apart reads as the log stuttering rather than as two
   * different people being buried.
   */
  const whose = `${term.replace(/^Your\b/, 'your')}'s funeral`;
  const line = spoke
    ? `You spoke at ${whose}. You got most of the way through it.`
    : going
      ? `You went to ${whose} and stood at the back.`
      : `You did not go to ${whose}.`;
  state.flags.funeral_history = line;
  state.flags.funeral_result = resultText(going, spoke, term, noticed);
  state.flags.funeral_result_title = spoke
    ? 'You said it out loud'
    : going
      ? 'You were there'
      : 'You stayed home';

  delete state.flags.funeral_body;
  delete state.flags.funeral_npc;
};

const SHARES_A_FUNERAL = new Set([
  'mother',
  'father',
  'sibling',
  'child',
  'spouse',
  'grandparent',
  'grandchild',
  'aunt_uncle',
  'niece_nephew',
  'cousin',
]);

const resultText = (going: boolean, spoke: boolean, term: string, noticed: number): string => {
  if (spoke) {
    return noticed > 0
      ? `You said what you could about ${term.toLowerCase()}, and afterwards people you had not spoken to in years wanted to talk to you.`
      : `You said what you could about ${term.toLowerCase()}, to a room that was mostly empty.`;
  }
  if (going) {
    return `You went. You did not have to say anything, and nobody asked you to.`;
  }
  return noticed > 0
    ? `You did not go. It was noticed, and it will keep being noticed for a long time.`
    : `You did not go. There was nobody left to notice.`;
};
