import type { Ambition, ContentPack } from '@lineage/content';
import type { LifeState } from '@lineage/shared-types';

/**
 * Did they get what they wanted?
 *
 * The research finding this exists for: BitLife's retention comes from weekly
 * challenges rather than from its loop, because a goal makes you play
 * differently. An ambition is that, but native — chosen at birth, bending which
 * events a life gets from the first year, and answered by the ending instead of
 * expiring on a Saturday.
 *
 * The verdict is deliberately not a score. "You never left. Some people don't."
 * reads as a life; "40% complete" reads as a checklist.
 */

export interface AmbitionVerdict {
  id: string;
  label: string;
  emoji: string;
  /** "You wanted to get out." */
  wanted: string;
  achieved: boolean;
  /** The line that answers it. */
  verdict: string;
}

const yearsMarried = (state: LifeState): number => {
  const spouse = state.relationships.find(
    (r) => r.kind === 'spouse' || r.formerKinds.includes('spouse'),
  );
  if (!spouse) return 0;
  const npc = state.npcs.find((n) => n.id === spouse.npcId);
  // A marriage that ended stops counting the day it ended.
  const until = spouse.kind === 'spouse' && npc?.alive ? state.character.age : spouse.lastContactAge;
  return Math.max(0, until - spouse.sinceAge);
};

const met = (ambition: Ambition, state: LifeState): boolean => {
  const c = state.character;
  const need = Number(ambition.test.atLeast ?? 0);

  switch (ambition.test.kind) {
    case 'net_worth': {
      const worth =
        c.finances.cash +
        c.finances.savings -
        c.finances.debt +
        state.assets.reduce((sum, a) => sum + a.value - a.loanOutstanding, 0);
      return worth >= need;
    }
    case 'children':
      return state.relationships.filter((r) => r.kind === 'child').length >= need;
    case 'following':
      return c.fame.following >= need;
    case 'married_years':
      return yearsMarried(state) >= need;
    case 'business_years':
      return state.businesses.some((b) => (c.deathAge ?? c.age) - b.foundedAtAge >= need);
    case 'education':
      return state.education.highestCompleted === String(ambition.test.atLeast);
    case 'close_people':
      return (
        state.relationships.filter(
          (r) => r.dimensions.closeness >= 65 && r.dimensions.trust >= 60,
        ).length >= need
      );
    case 'age':
      return (c.deathAge ?? c.age) >= need;
    case 'moved_city':
      // Left the city they were born in and stayed away.
      return state.history.some((e) => e.line.includes('moved')) || c.cityId !== state.bornCityId;
    case 'rich_and_clean': {
      const worth = c.finances.cash + c.finances.savings - c.finances.debt;
      return worth >= need && c.record.convictions.length === 0;
    }
    default:
      return false;
  }
};

export const judgeAmbition = (
  state: LifeState,
  content: ContentPack,
): AmbitionVerdict | null => {
  if (!state.ambitionId) return null;
  const ambition = content.ambitions.find((a) => a.id === state.ambitionId);
  if (!ambition) return null;

  const achieved = met(ambition, state);
  return {
    id: ambition.id,
    label: ambition.label,
    emoji: ambition.emoji,
    wanted: ambition.judgedBy,
    achieved,
    verdict: achieved ? ambition.won : ambition.lost,
  };
};
