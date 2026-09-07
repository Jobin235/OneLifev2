import type { LifeState } from '@lineage/shared-types';

/**
 * One word for the life that just ended.
 *
 * BitLife's ribbons are its strongest replay driver: a life is not just over,
 * it is *a kind of life*, and the next one is an attempt at a different kind.
 * That works because the ribbon is earned by how you actually played rather
 * than by a score, so it reads as a verdict instead of a rating.
 *
 * Exactly one is awarded. Rarer verdicts are checked first, so an unusual life
 * is named by the unusual thing about it rather than by whichever ordinary
 * label also happened to fit.
 */

export interface Ribbon {
  id: string;
  label: string;
  emoji: string;
  /** Said to the player once, on the legacy screen. */
  line: string;
}

interface Candidate extends Ribbon {
  earned: (facts: LifeFacts) => boolean;
}

interface LifeFacts {
  age: number;
  netWorth: number;
  children: number;
  convictions: number;
  yearsInside: number;
  jobsHeld: number;
  topSalary: number;
  education: string;
  marriages: number;
  friends: number;
  following: number;
  happiness: number;
  health: number;
  smarts: number;
  businesses: number;
  assets: number;
  decisions: number;
  countriesLived: number;
}

const factsOf = (state: LifeState): LifeFacts => {
  const c = state.character;
  const worth =
    c.finances.cash +
    c.finances.savings -
    c.finances.debt +
    state.assets.reduce((sum, a) => sum + a.value - a.loanOutstanding, 0);

  return {
    age: c.deathAge ?? c.age,
    netWorth: worth,
    children: state.relationships.filter((r) => r.kind === 'child').length,
    convictions: c.record.convictions.length,
    yearsInside: c.record.convictions.reduce((sum, x) => sum + x.sentenceYears, 0),
    jobsHeld: state.career.history.length + (state.career.current ? 1 : 0),
    topSalary: Math.max(
      c.finances.salary,
      ...state.career.history.map(() => 0),
      ...(state.career.current ? [state.career.current.salary] : [0]),
    ),
    education: state.education.highestCompleted,
    marriages: state.relationships.filter(
      (r) => r.kind === 'spouse' || r.formerKinds.includes('spouse'),
    ).length,
    friends: state.relationships.filter(
      (r) => r.kind === 'friend' || r.kind === 'best_friend',
    ).length,
    following: c.fame.following,
    happiness: c.stats.happiness,
    health: c.stats.health,
    smarts: c.stats.smarts,
    businesses: state.businesses.length,
    assets: state.assets.length,
    decisions: Object.values(state.eventLog).reduce((sum, ages) => sum + ages.length, 0),
    countriesLived: 1,
  };
};

/*
 * Order matters: first match wins, so the list runs from the most particular
 * verdict to the most ordinary. A life is named by what was unusual about it.
 */
const CANDIDATES: Candidate[] = [
  {
    id: 'notorious',
    label: 'Notorious',
    emoji: '🔫',
    line: 'You were a name people said quietly.',
    earned: (f) => f.convictions >= 4 && f.yearsInside >= 8,
  },
  {
    id: 'crooked',
    label: 'Crooked',
    emoji: '🎭',
    line: 'You broke the rules more often than you kept them.',
    earned: (f) => f.convictions >= 2,
  },
  {
    id: 'loaded',
    label: 'Loaded',
    emoji: '💰',
    line: 'You died with more money than most people see in a lifetime.',
    earned: (f) => f.netWorth >= 1_000_000_00,
  },
  {
    id: 'famous',
    label: 'Famous',
    emoji: '🌟',
    line: 'Strangers knew your name.',
    earned: (f) => f.following >= 100_000,
  },
  {
    id: 'founder',
    label: 'Founder',
    emoji: '🏗️',
    line: 'You built something that existed because you did.',
    earned: (f) => f.businesses >= 1 && f.netWorth >= 20_000_000,
  },
  {
    id: 'scholar',
    label: 'Scholar',
    emoji: '🎓',
    line: 'You never stopped studying.',
    earned: (f) => f.education === 'graduate' && f.smarts >= 80,
  },
  {
    id: 'ancient',
    label: 'Ancient',
    emoji: '🕰️',
    line: 'You outlived nearly everyone who knew you.',
    earned: (f) => f.age >= 95,
  },
  {
    id: 'patriarch',
    label: 'Head of the family',
    emoji: '👨‍👩‍👧‍👦',
    line: 'You left a lot of people behind who called you theirs.',
    earned: (f) => f.children >= 4,
  },
  {
    id: 'drifter',
    label: 'Drifter',
    emoji: '🧳',
    line: 'You never stayed anywhere long enough to be missed.',
    earned: (f) => f.jobsHeld >= 6 && f.friends === 0,
  },
  {
    id: 'beloved',
    label: 'Beloved',
    emoji: '💛',
    line: 'A lot of people are going to miss you.',
    earned: (f) => f.friends >= 4 && f.happiness >= 70,
  },
  {
    id: 'lonely',
    label: 'Alone',
    emoji: '🪟',
    line: 'There was nobody left to tell.',
    earned: (f) => f.friends === 0 && f.children === 0 && f.marriages === 0 && f.age >= 60,
  },
  {
    id: 'lazy',
    label: 'Lazy',
    emoji: '🛋️',
    line: 'You let almost all of it happen to you.',
    earned: (f) => f.decisions <= 6 && f.age >= 50,
  },
  {
    id: 'unlucky',
    label: 'Unlucky',
    emoji: '🌧️',
    line: 'Not much of it was your fault.',
    earned: (f) => f.age < 45 && f.netWorth < 0,
  },
  {
    id: 'brief',
    label: 'Cut short',
    emoji: '🕯️',
    line: 'There was supposed to be more of it.',
    earned: (f) => f.age < 40,
  },
  {
    id: 'steady',
    label: 'Steady',
    emoji: '🌾',
    line: 'You did it properly, and it was enough.',
    earned: (f) => f.jobsHeld >= 1 && f.age >= 70,
  },
];

/** The fallback, for a life that was none of the above in particular. */
const ORDINARY: Ribbon = {
  id: 'ordinary',
  label: 'Ordinary',
  emoji: '🌤️',
  line: 'An ordinary life, which is the most common kind and not the worst.',
};

export const ribbonFor = (state: LifeState): Ribbon => {
  const facts = factsOf(state);
  const earned = CANDIDATES.find((candidate) => candidate.earned(facts));
  if (!earned) return ORDINARY;
  const { earned: _test, ...ribbon } = earned;
  return ribbon;
};

/** Every ribbon that exists, for the collection screen. */
export const allRibbons = (): Ribbon[] => [
  ...CANDIDATES.map(({ earned: _e, ...r }) => r),
  ORDINARY,
];
