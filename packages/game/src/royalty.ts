import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import {
  ROYAL_TITLES,
  clampStat,
  type CountryPack,
  type LifeState,
  type RoyalRank,
  type RoyalStanding,
} from '@lineage/shared-types';
import {
  applyFameDelta,
  checkInvariants,
  makeRng,
  pushHistory,
  refreshDerived,
  type Rng,
} from '@lineage/simulation';

/**
 * A title, and what it costs to keep.
 *
 * Royalty is the one thing in this game that is not earned: a small fraction of
 * characters born in a monarchy are born to it, and everybody else has to marry
 * one of them. What stops it being a badge is respect. Doing the job raises it,
 * behaving like somebody who cannot be touched lowers it, and at nothing the
 * subjects take the title back — from you and from whoever you married.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class RoyalRejected extends Error {}

/** Royal duties a year. Enough to recover from a bad decision, not enough to farm. */
const DUTIES_A_YEAR = 3;

/**
 * Who is in the line at all, and how far back they start.
 *
 * BitLife puts only princes in the succession. That reads as a cliff — a duke
 * of the same house waiting behind nobody at all — so a duke is in the line
 * here too, just far enough back that the throne is a long wait rather than a
 * plan. Everybody below that holds a title and nothing else, which is what a
 * title mostly is.
 */
const LINE_START: Partial<Record<RoyalRank, [number, number]>> = {
  duke: [7, 18],
  prince: [1, 6],
};

const titleFor = (rank: RoyalRank, sex: string, country: CountryPack): string => {
  const female = sex === 'female';
  if (rank === 'monarch' && country.monarchy) {
    return female ? country.monarchy.crown.female : country.monarchy.crown.male;
  }
  const pair = ROYAL_TITLES[rank];
  return female ? pair.female : pair.male;
};

/* ------------------------------------------------------------------ *
 * Being born to it
 * ------------------------------------------------------------------ */

/**
 * Decided once, at the first age-up, from the country and the seed.
 *
 * The lesser titles only exist where the country says they do: outside Europe
 * BitLife grants the top rank or nothing, so a royal birth in those places is a
 * prince and never a viscount.
 */
export const royalBirth = (state: LifeState, content: ContentPack, rng: Rng): void => {
  if (state.royal || state.flags.royal_birth_rolled) return;
  state.flags.royal_birth_rolled = true;

  const country = content.countriesById.get(state.character.countryId);
  const monarchy = country?.monarchy;
  if (!country || !monarchy) return;
  if (!rng.chance(monarchy.birthChance)) return;

  /*
   * Weighted down the ladder: barons are common and princes are not, which is
   * both true and what makes the line of succession worth anything.
   */
  const ladder: RoyalRank[] = monarchy.lesserTitles
    ? ['baron', 'baron', 'baron', 'viscount', 'viscount', 'earl', 'earl', 'marquess', 'duke', 'duke', 'prince', 'prince']
    : ['prince'];
  const rank = rng.pick(ladder);

  grant(state, rank, 'birth', country, rng);
  const standing = state.royal!;
  pushHistory(
    state,
    'family',
    '👑',
    `You were born ${standing.title} ${state.character.firstName} of ${monarchy.house.replace(/^the /, '')}.`,
    90,
  );
};

/** Puts a title on somebody, with the money and the fame that come with it. */
const grant = (
  state: LifeState,
  rank: RoyalRank,
  by: RoyalStanding['by'],
  country: CountryPack,
  rng: Rng,
): void => {
  const monarchy = country.monarchy;
  if (!monarchy) return;

  const start = LINE_START[rank];
  const inLine = rank === 'monarch' ? 0 : start ? rng.int(start[0], start[1]) : null;
  state.royal = {
    rank,
    title: titleFor(rank, state.character.sex, country),
    house: monarchy.house,
    by,
    /*
     * Nobody starts at the top. A new royal is given the benefit of the doubt
     * and has to keep it, which is the whole loop.
     */
    respect: by === 'birth' ? 72 : 58,
    inLine,
    crownedAtAge: rank === 'monarch' ? state.character.age : null,
    dutiesThisYear: 0,
  };

  /*
   * The estate, not a salary. BitLife royals have no ordinary job and money is
   * not the constraint — respect is — so this is generous on purpose and the
   * interesting decisions are elsewhere.
   */
  const estate = [40_000_00, 90_000_00, 180_000_00, 400_000_00, 900_000_00, 2_400_000_00, 8_000_000_00];
  state.character.finances.savings += estate[ROYAL_RANK_ORDER[rank]]!;

  applyFameDelta(state.character, {
    following: rank === 'monarch' ? 900_000 : 20_000 * (ROYAL_RANK_ORDER[rank] + 1),
    fans: 6,
    knownFor: 'being born to it',
  });
};

const ROYAL_RANK_ORDER: Record<RoyalRank, number> = {
  baron: 0,
  viscount: 1,
  earl: 2,
  marquess: 3,
  duke: 4,
  prince: 5,
  monarch: 6,
};

/* ------------------------------------------------------------------ *
 * The year
 * ------------------------------------------------------------------ */

/**
 * One year of holding a title: the line shortening ahead of you, the throne
 * arriving, and the drift back toward being tolerated.
 */
export const advanceRoyalYear = (state: LifeState, content: ContentPack, rng: Rng): void => {
  if (!state.character.alive) return;

  /*
   * The marry-in check runs first and runs even for commoners, because that is
   * the whole second route in. It reads the marriage rather than intercepting
   * it: a partner becomes a spouse through an ordinary `relationship_kind`
   * effect in authored content, and hooking every one of those would mean
   * teaching the pure effect layer about crowns.
   */
  const spouse = state.relationships.find((r) => r.kind === 'spouse');
  if (spouse && !state.royal) marriedInto(state, spouse.npcId, content, rng);

  const royal = state.royal;
  if (!royal) return;
  royal.dutiesThisYear = 0;

  const country = content.countriesById.get(state.character.countryId);
  if (!country?.monarchy) return;

  /*
   * Respect decays toward the middle rather than staying where you left it. A
   * royal who does nothing is neither loved nor hated for long, and this is what
   * stops one good year of duties carrying a reign for forty.
   */
  if (royal.respect > 50) royal.respect = Math.max(50, royal.respect - 2);
  else if (royal.respect < 50) royal.respect = Math.min(50, royal.respect + 1);

  if (royal.inLine !== null && royal.inLine > 0) {
    /*
     * Somebody ahead dies, or is passed over, every few years.
     *
     * Tuned up from a first pass at 0.16: a prince five back reached the front
     * of the line at forty-six and died at fifty-two without ever being
     * crowned, which is a lifetime spent in a queue rather than a reign to
     * play. At this rate the same prince is on the throne in his twenties.
     */
    if (rng.chance(0.28)) {
      royal.inLine -= 1;
      pushHistory(
        state,
        'family',
        '🕯️',
        royal.inLine === 0
          ? 'Another death in the family. There is nobody ahead of you now.'
          : `Another death in the family. ${royal.inLine} ${royal.inLine === 1 ? 'person stands' : 'people stand'} between you and the throne.`,
        60,
      );
    }
    // And then the crown itself falls vacant.
    if (royal.inLine === 0 && rng.chance(0.45)) crown(state, country);
  }

  if (royal.respect <= 0) revolt(state, content);
};

/** The throne. */
const crown = (state: LifeState, country: CountryPack): void => {
  const royal = state.royal;
  if (!royal || !country.monarchy) return;

  royal.rank = 'monarch';
  royal.title = titleFor('monarch', state.character.sex, country);
  royal.by = 'succession';
  royal.crownedAtAge = state.character.age;
  royal.inLine = 0;
  royal.respect = clampStat(royal.respect + 12);
  state.character.finances.savings += 6_000_000_00;
  applyFameDelta(state.character, { following: 900_000, fans: 10, knownFor: 'the crown' });

  pushHistory(
    state,
    'family',
    '👑',
    `You are ${royal.title} of ${country.name} now.`,
    98,
  );
};

/**
 * The other ending.
 *
 * Titles are stripped from the character and from whoever they married, which
 * is BitLife's rule and the reason marrying in is not a free ride: your spouse
 * can lose you the thing you married them for.
 */
const revolt = (state: LifeState, content: ContentPack): void => {
  const royal = state.royal;
  if (!royal) return;
  const country = content.countriesById.get(state.character.countryId);

  state.royal = null;
  state.flags.exiled = true;
  state.flags.former_title = royal.title;
  state.character.stats.happiness = clampStat(state.character.stats.happiness - 30);
  applyFameDelta(state.character, { haters: 40, fans: -20, knownFor: 'being thrown out' });

  // The estate goes; what was already spent or banked elsewhere does not.
  state.character.finances.savings = Math.round(state.character.finances.savings * 0.15);

  pushHistory(
    state,
    'family',
    '🔥',
    `The people of ${country?.name ?? 'the country'} had enough. You were stripped of the title and put on a boat.`,
    99,
  );
};

/* ------------------------------------------------------------------ *
 * Marrying in
 * ------------------------------------------------------------------ */

/**
 * Called when a marriage completes. A royal spouse confers a title; the rank is
 * one step below theirs, because you married in and everybody knows it.
 */
export const marriedInto = (
  state: LifeState,
  spouseNpcId: string,
  content: ContentPack,
  rng: Rng,
): void => {
  if (state.royal) return;
  const country = content.countriesById.get(state.character.countryId);
  if (!country?.monarchy) return;

  const rank = state.flags[`royal_npc_${spouseNpcId}`];
  if (typeof rank !== 'string') return;

  const below = ROYAL_RANKS_BELOW[rank as RoyalRank];
  if (!below) return;

  grant(state, below, 'marriage', country, rng);
  pushHistory(
    state,
    'love',
    '👑',
    `You married into ${country.monarchy.house.replace(/^the /, '')}. They call you ${state.royal!.title} now.`,
    92,
  );
};

const ROYAL_RANKS_BELOW: Record<RoyalRank, RoyalRank | null> = {
  baron: null,
  viscount: 'baron',
  earl: 'viscount',
  marquess: 'earl',
  duke: 'marquess',
  prince: 'duke',
  // Marry the monarch and you are their consort, which is the rank below.
  monarch: 'prince',
};

/* ------------------------------------------------------------------ *
 * The job
 * ------------------------------------------------------------------ */

/** The things a royal can do that nobody else can. */
export const ROYAL_ACTIONS = [
  'public_service',
  'public_disservice',
  'honorific',
  'law_review',
  'execute',
  'abdicate',
] as const;
export type RoyalAction = (typeof ROYAL_ACTIONS)[number];

const SERVICE: Array<{ line: string; respect: number }> = [
  { line: 'You opened a hospital wing and stayed longer than the schedule allowed.', respect: 9 },
  { line: 'You spent a week in the flooded counties and were photographed in the water.', respect: 12 },
  { line: 'You gave the speech everybody had been waiting for and did not make it about yourself.', respect: 8 },
  { line: 'You visited every school in the north. There were four hundred drawings.', respect: 7 },
  { line: 'You gave a great deal of your own money away and let somebody else announce it.', respect: 11 },
  { line: 'You sat with the families for six hours after the fire. Nobody filmed it.', respect: 14 },
];

const DISSERVICE: Array<{ line: string; respect: number }> = [
  { line: 'You closed a public road for a shooting party.', respect: -11 },
  { line: 'You had the fountain in the square replaced with one of yourself.', respect: -16 },
  { line: 'You were photographed asleep at a state funeral.', respect: -9 },
  { line: 'You raised the tax on bread and were quoted explaining why it was fine.', respect: -22 },
  { line: 'You had the palace repainted. Twice. In the same year.', respect: -13 },
  { line: 'You told a reporter that the poor were poor on purpose.', respect: -19 },
];

const HONOURS = [
  'a nurse who had worked forty years without a day off',
  'the woman who pulled three people out of the river',
  'a novelist nobody in the palace had read',
  'the man who has swept the same street since he was nineteen',
  'a scientist who would rather not have come',
];

const LAWS: Array<{ label: string; approve: number; refuse: number; body: string }> = [
  {
    label: 'A tax on the estates, yours included',
    approve: 14,
    refuse: -8,
    body: 'The chamber has passed it and it needs your name. It would cost you a great deal.',
  },
  {
    label: 'A curfew in the three northern cities',
    approve: -12,
    refuse: 7,
    body: 'The ministers say it is temporary. The ministers have said that before.',
  },
  {
    label: 'Free schooling to eighteen',
    approve: 16,
    refuse: -14,
    body: 'It is popular, it is expensive, and the treasury has written you a long letter about it.',
  },
  {
    label: 'A new palace, at public expense',
    approve: -21,
    refuse: 9,
    body: 'The architect is already halfway through the drawings. Nobody asked the country.',
  },
];

export interface RoyalActResult {
  state: LifeState;
  line: string;
  respectBefore: number;
  respectAfter: number;
}

/**
 * Do something as a royal.
 *
 * Every one of these is a respect transaction and nothing else — there is no
 * money in it, no stat to grind. That is deliberate: the position is the whole
 * resource, and the only question a royal ever faces is what they are prepared
 * to spend it on.
 */
export const royalAct = (
  state: LifeState,
  action: RoyalAction,
  content: ContentPack,
  config: GameConfig,
  choice?: string,
): RoyalActResult => {
  const royal = state.royal;
  if (!royal) throw new RoyalRejected('you are not royalty');
  if (!state.character.alive) throw new RoyalRejected('a dead character cannot reign');
  if (state.activeEvent) throw new RoyalRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new RoyalRejected('not from in here');

  const lock = royalLock(state, action);
  if (lock) throw new RoyalRejected(lock.toLowerCase());

  const before = structuredClone(state);
  const respectBefore = royal.respect;
  try {
    const rng = makeRng(state.seed, 'royal', action, state.character.age, royal.dutiesThisYear);
    state.step += 1;
    if (action !== 'abdicate') royal.dutiesThisYear += 1;

    let line = '';
    switch (action) {
      case 'public_service': {
        const duty = rng.pick(SERVICE);
        royal.respect = clampStat(royal.respect + duty.respect);
        state.character.stats.happiness = clampStat(state.character.stats.happiness + 2);
        line = duty.line;
        break;
      }

      case 'public_disservice': {
        const sin = rng.pick(DISSERVICE);
        royal.respect = Math.max(0, royal.respect + sin.respect);
        applyFameDelta(state.character, { haters: 4, fans: -2 });
        line = sin.line;
        break;
      }

      case 'honorific': {
        /*
         * The cheapest thing a crown can do and one of the few that is purely
         * good. Small, because it is small: handing somebody a medal is not the
         * same as sitting with them after the fire.
         */
        royal.respect = clampStat(royal.respect + 5);
        line = `You knighted ${rng.pick(HONOURS)}.`;
        break;
      }

      case 'law_review': {
        const law = LAWS.find((l) => l.label === choice) ?? rng.pick(LAWS);
        const approved = choice === undefined ? rng.chance(0.5) : true;
        const delta = approved ? law.approve : law.refuse;
        royal.respect = clampStat(Math.max(0, royal.respect + delta));
        line = approved
          ? `You signed it: ${law.label.toLowerCase()}.`
          : `You refused to sign: ${law.label.toLowerCase()}.`;
        break;
      }

      case 'execute': {
        /*
         * Kept, and kept expensive. BitLife has a whole menu of methods; one
         * line and a large number is the same beat without the theatre, and
         * this is the only action that can end a reign on its own.
         */
        royal.respect = Math.max(0, royal.respect - 34);
        state.character.stats.happiness = clampStat(state.character.stats.happiness - 6);
        applyFameDelta(state.character, { haters: 22, fans: -12 });
        line = 'You had somebody put to death. The country read about it in the morning.';
        break;
      }

      case 'abdicate': {
        const title = royal.title;
        state.royal = null;
        state.flags.former_title = title;
        state.flags.abdicated = true;
        // You keep what you were given; you lose what came with the job.
        state.character.finances.savings = Math.round(state.character.finances.savings * 0.55);
        line = `You gave up the title. They will call you ${state.character.firstName} now.`;
        break;
      }
    }

    pushHistory(state, 'family', action === 'public_disservice' ? '🙄' : '👑', line, 45);
    refreshDerived(state, config);
    checkInvariants(state, before);

    // A revolt can land on the same tap that caused it.
    if (state.royal && state.royal.respect <= 0) revolt(state, content);

    return {
      state,
      line,
      respectBefore,
      respectAfter: state.royal?.respect ?? 0,
    };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** Why a royal action is not available, or null when it is. */
export const royalLock = (state: LifeState, action: RoyalAction): string | null => {
  const royal = state.royal;
  if (!royal) return 'You are not royalty';
  if (state.character.record.incarceration) return 'Not from in here';
  if (state.character.age < 16 && action !== 'public_service') {
    return 'You are too young for that';
  }
  if (action === 'execute' && royal.rank !== 'monarch') {
    return 'Only the crown can order that';
  }
  if (action === 'law_review' && royal.rank !== 'monarch') {
    return 'Laws do not come to you';
  }
  if (action !== 'abdicate' && royal.dutiesThisYear >= DUTIES_A_YEAR) {
    return 'You have done enough this year';
  }
  return null;
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

const RESPECT_WORD = (n: number): string => {
  if (n >= 85) return 'Adored';
  if (n >= 65) return 'Respected';
  if (n >= 45) return 'Tolerated';
  if (n >= 25) return 'Resented';
  if (n > 0) return 'Hated';
  return 'Finished';
};

export interface RoyalView {
  title: string;
  house: string;
  /** "Third in line", "The throne is yours", or null when out of the line. */
  line: string | null;
  respect: number;
  respectWord: string;
  monarch: boolean;
  /** How they came by it, said plainly. */
  origin: string;
  dutiesLeft: number;
  actions: Array<{
    id: RoyalAction;
    icon: string;
    label: string;
    note: string;
    available: boolean;
    locked: string | null;
  }>;
}

const ACTION_COPY: Record<RoyalAction, { icon: string; label: string; note: string }> = {
  public_service: { icon: '🎗️', label: 'Royal duties', note: 'Do the job. They will notice.' },
  public_disservice: { icon: '🙄', label: 'Cause some chaos', note: 'Because nobody can stop you' },
  honorific: { icon: '🗡️', label: 'Knight somebody', note: 'Costs you nothing, means something' },
  law_review: { icon: '📜', label: 'Sign a law', note: 'The chamber is waiting on your name' },
  execute: { icon: '⚰️', label: 'Order an execution', note: 'The country will hear about it' },
  abdicate: { icon: '🚪', label: 'Abdicate', note: 'Keep the money, lose the title' },
};

export const royalView = (state: LifeState): RoyalView | null => {
  const royal = state.royal;
  if (!royal) return null;

  const place =
    royal.rank === 'monarch'
      ? null
      : royal.inLine === null
        ? null
        : royal.inLine === 0
          ? 'The throne is yours the moment it is empty'
          : `${ORDINAL[royal.inLine] ?? `${royal.inLine + 1}th`} in line`;

  return {
    title: royal.title,
    house: royal.house,
    line: place,
    respect: royal.respect,
    respectWord: RESPECT_WORD(royal.respect),
    monarch: royal.rank === 'monarch',
    origin:
      royal.by === 'birth'
        ? 'Born to it'
        : royal.by === 'marriage'
          ? 'Married into it'
          : 'It came to you',
    dutiesLeft: Math.max(0, DUTIES_A_YEAR - royal.dutiesThisYear),
    actions: ROYAL_ACTIONS.map((id) => {
      const locked = royalLock(state, id);
      return { id, ...ACTION_COPY[id], available: locked === null, locked };
    }),
  };
};

const ORDINAL = ['', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

/* ------------------------------------------------------------------ *
 * The next one
 * ------------------------------------------------------------------ */

/**
 * Hands the title down.
 *
 * Only to the eldest child, which is what primogeniture is and what BitLife
 * does. A monarch's heir does not wake up crowned: they take the parent's rank
 * at the front of the line, and the throne arrives the way it always does.
 */
export const inheritTitle = (
  state: LifeState,
  previous: LifeState,
  heirNpcId: string,
): void => {
  const royal = previous.royal;
  if (!royal) return;

  const children = previous.relationships
    .filter((r) => r.kind === 'child')
    .map((r) => ({ rel: r, npc: previous.npcs.find((n) => n.id === r.npcId) }))
    .filter((c): c is { rel: typeof c.rel; npc: NonNullable<typeof c.npc> } => c.npc !== undefined)
    .sort((a, b) => b.npc.age - a.npc.age);

  const eldest = children[0];
  if (!eldest || eldest.npc.id !== heirNpcId) return;

  const female = state.character.sex === 'female';
  const rank = royal.rank === 'monarch' ? 'prince' : royal.rank;
  const pair = ROYAL_TITLES[rank];

  state.royal = {
    rank,
    title: female ? pair.female : pair.male,
    house: royal.house,
    by: 'birth',
    /*
     * The parent's standing carries, softened toward the middle. A hated king
     * does not hand his son a hated country, and a beloved one does not hand
     * over the affection either — you inherit the position, not the goodwill.
     */
    respect: clampStat(Math.round(50 + (royal.respect - 50) * 0.5)),
    inLine: rank === 'prince' ? 0 : royal.inLine,
    crownedAtAge: null,
    dutiesThisYear: 0,
  };

  pushHistory(
    state,
    'family',
    '👑',
    `The title came with the estate. You are ${state.royal.title} ${state.character.firstName} now.`,
    88,
  );
};
