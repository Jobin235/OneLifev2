import type { GameConfig } from '@lineage/config';
import type { Activity, ContentPack } from '@lineage/content';
import { interactionsFor } from './interact.js';
import { shopView } from './shop.js';
import type { LifeState, Npc } from '@lineage/shared-types';
import { STAT_DISPLAY } from '@lineage/shared-types';
import {
  displayMemories,
  formatMoney,
  formatMoneyExact,
  formatSigned,
  gradeLetter,
  gpa,
  jobLine,
  monthlyLines,
  navSlot,
  netWorth,
  performanceBand,
  PERFORMANCE_LABEL,
  relationshipLabel,
  stationLine,
  surfacedScore,
} from '@lineage/simulation';

/**
 * Presentation-ready state (spec §76). The client renders these fields; it does
 * not derive, compute, or evaluate anything. Every string here is one the design
 * puts on screen.
 */

const DATE_PREFIXES = [
  'Tuesday, June 14',
  'Friday, October 3',
  'Sunday, February 11',
  'Thursday, August 22',
  'Monday, April 7',
  'Wednesday, November 9',
  'Saturday, March 2',
];

const BAND_COLOR = { close: '#DB6C9B', around: '#8A7E70', drifted: '#A79B8C' } as const;

export const lifeView = (state: LifeState, content: ContentPack) => {
  const { character } = state;
  const country = content.countriesById.get(character.countryId);
  const city = country?.cities.find((c) => c.id === character.cityId);
  const job = jobLine(state);

  const subtitleParts = [`Age ${character.age}`, city?.name ?? '', job].filter(Boolean);

  return {
    lifeId: state.id,
    /** Bumps on every mutation, so the client knows when a panel is stale. */
    revision: state.step,
    generation: state.lineage.generation,
    dateLine: DATE_PREFIXES[character.age % DATE_PREFIXES.length]!,
    name: `${character.firstName} ${character.lastName}`,
    age: character.age,
    avatarEmoji: avatarFor(state),
    subtitle: subtitleParts.join(' · '),
    stats: (Object.keys(character.stats) as (keyof typeof character.stats)[]).map((key) => ({
      key,
      icon: STAT_DISPLAY[key].icon,
      label: STAT_DISPLAY[key].label,
      value: character.stats[key],
      color: STAT_DISPLAY[key].color,
    })),
    jobLine: job,
    /**
     * The header line under the name: what you are right now, in two or three
     * words. The longer "Interior Designer, Hollywood Design" stays on jobLine
     * for the screens that have room for it.
     */
    station: stationLine(state),
    /** Which of the five nav slots the contextual first one is showing. */
    navSlot: navSlot(state),
    money: formatMoneyExact(character.finances.cash + character.finances.savings),
    /*
     * Bank Balance, and it is allowed to be negative. A student loan does not
     * hand you cash — it puts a number in the header that follows you for a
     * decade, and watching it climb back to zero is most of what early
     * adulthood feels like.
     *
     * Debt secured on something you own is left out of it. A mortgage is not
     * money you are down, it is half of a house, and netting it here made the
     * header say −$16,379 on the same screen where net worth said $343,213.
     */
    balance: formatMoneyExact(unsecuredPosition(state)),
    gameState: state.gameState,
    activeEvent: state.activeEvent,
    resolvedEvent: state.resolvedEvent,
    /*
     * The whole life, oldest first — this is the main screen, not a summary of
     * the current year. A life is the log; scrolling back through it is how a
     * player remembers who Daniel was and when the business started.
     *
     * History is append-only and never truncated, so this is complete back to
     * birth. A 90-year life is a few hundred short entries, which is nothing to
     * send and nothing to render.
     */
    log: state.history.map((e) => ({
      atAge: e.atAge,
      icon: e.icon,
      text: e.line,
      major: e.significance >= 60,
    })),
    canAgeUp: character.alive && state.activeEvent === null,
    ageUpLabel: !character.alive
      ? 'Your life is over'
      : state.activeEvent
        ? 'Decide first ↑'
        : `AGE UP → ${character.age + 1}`,
    incarcerated: character.record.incarceration !== null,
    legacy: state.legacy,
  };
};

/** Cash and savings, less the debts that are not held against anything. */
const unsecuredPosition = (state: LifeState): number => {
  const owned = state.assets.map((a) => a.label.toLowerCase());
  const unsecured = state.character.finances.debts
    .filter((debt) => {
      const label = debt.label.toLowerCase();
      return !owned.some((asset) => label.includes(asset));
    })
    .reduce((sum, debt) => sum + debt.balance, 0);
  return state.character.finances.cash + state.character.finances.savings - unsecured;
};

const avatarFor = (state: LifeState): string => {
  const { character } = state;
  if (character.record.incarceration) return '🧑';
  if (character.age <= 3) return '👶';
  if (character.age <= 12) return character.sex === 'female' ? '👧' : '👦';
  if (character.age <= 19) return character.sex === 'female' ? '👩‍🎓' : '👨‍🎓';
  if (character.age >= 70) return character.sex === 'female' ? '👵' : '👴';
  if (state.businesses.some((b) => !b.closed)) return '🧑‍💼';
  if (state.career.current?.trackId === 'software') return '🧑‍💻';
  return character.sex === 'female' ? '👩' : '🧑';
};

/** Design 2A: grouped by closeness, subtitles carrying facts rather than labels. */
export const peopleView = (state: LifeState) => {
  const rows = state.relationships
    .map((rel) => {
      const npc = state.npcs.find((n) => n.id === rel.npcId);
      if (!npc) return null;
      const romantic = rel.kind === 'partner' || rel.kind === 'spouse';
      return {
        npcId: npc.id,
        name: `${npc.firstName} ${npc.lastName}`,
        emoji: npc.avatarEmoji,
        subtitle: rel.subtitle || relationshipLabel(rel, npc),
        band: rel.band,
        alive: npc.alive,
        scoreIcon: romantic ? '💞' : rel.dimensions.conflict > 50 ? '😐' : '🙂',
        score: surfacedScore(rel),
        scoreColor: BAND_COLOR[rel.band],
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row && row.alive);

  const close = rows.filter((r) => r.band === 'close');
  const around = rows.filter((r) => r.band === 'around');
  const drifted = rows.filter((r) => r.band === 'drifted');

  return {
    total: rows.length,
    headline: `${rows.length} ${rows.length === 1 ? 'person' : 'people'} you actually know`,
    close,
    around,
    driftedCount: drifted.length,
    driftedLine:
      drifted.length > 0
        ? `${drifted.length} ${drifted.length === 1 ? 'person' : 'people'} you've lost touch with. They keep living whether you call or not.`
        : null,
    drifted,
  };
};

/** Design 2B: a memory list, not a meter. */
export const personView = (
  state: LifeState,
  npcId: string,
  config: GameConfig,
  content: ContentPack,
) => {
  const rel = state.relationships.find((r) => r.npcId === npcId);
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!rel || !npc) return null;

  const romantic = rel.kind === 'partner' || rel.kind === 'spouse';
  const years = state.character.age - rel.sinceAge;

  return {
    npcId,
    name: `${npc.firstName} ${npc.lastName}`,
    emoji: npc.avatarEmoji,
    header: [
      relationshipLabel(rel, npc),
      String(npc.age),
      npc.occupation,
      years >= 1 ? `together ${years} years` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    descriptor: npc.descriptor,
    meters: romantic
      ? [
          { icon: '💞', label: 'Love', value: rel.dimensions.romance },
          { icon: '🤝', label: 'Trust', value: rel.dimensions.trust },
        ]
      : [
          { icon: '🤝', label: 'Trust', value: rel.dimensions.trust },
          { icon: '🫱', label: 'Closeness', value: rel.dimensions.closeness },
        ],
    memories: displayMemories(rel, config).map((m) => ({ atAge: m.atAge, line: m.line })),
    interactions: interactionsFor(state, npcId, content),
    onTheirMind: rel.onTheirMind,
    stats: npc.stats
      ? (Object.keys(npc.stats) as (keyof typeof npc.stats)[]).map((key) => ({
          icon: STAT_DISPLAY[key].icon,
          label: STAT_DISPLAY[key].label,
          value: npc.stats![key],
        }))
      : [],
  };
};

const GROUP_TINT: Record<string, { tint: string; noteColor: string }> = {
  body_and_head: { tint: '#E9F4EE', noteColor: '#4C7C64' },
  fun_and_trouble: { tint: '#FFF3D9', noteColor: '#8A6A20' },
  bigger_moves: { tint: '#FFFFFF', noteColor: '#8A7E70' },
  relationship: { tint: '#FDE9F1', noteColor: '#C25585' },
  work: { tint: '#EAF2FA', noteColor: '#2E6FA8' },
  school: { tint: '#EEEAFB', noteColor: '#5F51AE' },
  prison: { tint: '#F0EBE2', noteColor: '#6E6255' },
};

/**
 * Everything the player could do, and everything they could not.
 *
 * Locked rows stay on the list, greyed, with the reason — which is how BitLife
 * does it and is the difference between a menu and a map. Filtering them out
 * meant a fourteen-year-old saw six things and had no idea the other thirty
 * existed, so there was nothing to grow into and no reason to look again next
 * year. See docs/BITLIFE-LOOP-SPEC.md §5.
 */
export const actionsView = (state: LifeState, content: ContentPack) => {
  const liquid = state.character.finances.cash + state.character.finances.savings;
  const inside = state.character.record.incarceration !== null;
  const enrolled = state.education.current !== null;
  const employed = state.career.current !== null;

  /** Why this is not available, or null when it is. Order is deliberate. */
  const lockedBy = (a: Activity): string | null => {
    if (state.character.age < a.minAge) return `You have to be ${a.minAge}`;
    if (state.character.age > a.maxAge) return 'That time has passed';

    if (a.onlyWhen === 'incarcerated') {
      if (!inside) return 'Only in prison';
      // Parole is a door that has to be open before it is worth asking about.
      if (a.id === 'prison_parole') {
        const left = state.character.record.incarceration!.paroleEligibleIn;
        return left > 0 ? `Not eligible for ${left} more ${left === 1 ? 'year' : 'years'}` : null;
      }
      return null;
    }
    if (inside) {
      const allowedInside = a.group === 'body_and_head' || a.id === 'study';
      return allowedInside ? null : 'Not from in here';
    }
    if (a.onlyWhen === 'enrolled' || a.group === 'school') {
      return enrolled ? null : 'You are not at school';
    }
    if (a.onlyWhen === 'employed' || a.group === 'work') {
      return employed ? null : 'You need a job first';
    }
    if (a.onlyWhen === 'unemployed') {
      return !employed && !state.career.retired ? null : 'You already have work';
    }
    if (a.group === 'relationship') {
      if (a.id === 'call_your_mom') {
        const mother = state.relationships.find((r) => r.kind === 'mother');
        const alive = mother && state.npcs.find((n) => n.id === mother.npcId)?.alive;
        return alive ? null : 'There is nobody to call';
      }
      const partner = state.relationships.some((r) => r.kind === 'partner' || r.kind === 'spouse');
      return partner ? null : 'You are not seeing anyone';
    }
    return null;
  };

  return content.activities
    /*
     * One long look ahead, not the whole catalogue. Something twenty years off
     * is not aspiration, it is noise — but the next few years of a life should
     * be visible from where the player is standing.
     */
    .filter((a) => state.character.age + 8 >= a.minAge && state.character.age <= a.maxAge)
    /*
     * Prison actions belong to prison, not to a locked future. Listing "Lift —
     * only in prison" to a free character reads as the game suggesting they get
     * arrested, and it is the one lock that is not something to grow into.
     */
    .filter((a) => a.onlyWhen !== 'incarcerated' || inside)
    .map((a) => {
      const tint = GROUP_TINT[a.group] ?? GROUP_TINT.bigger_moves!;
      const used = state.activityUsage[a.id] ?? 0;
      const limited = a.effectiveTimes > 0;
      const timesLeft = limited ? Math.max(0, a.effectiveTimes - used) : null;

      const locked = lockedBy(a);
      const unaffordable = a.cost > liquid;
      // Past its allowance a "no_effect" activity is pointless rather than
      // forbidden; the row says so instead of pretending it still works.
      const spent = limited && used >= a.effectiveTimes && a.onRepeat === 'no_effect';
      const risky = limited && used >= a.effectiveTimes && a.onRepeat === 'riskier';

      // An open decision blocks everything, so it is said once at the screen
      // level rather than repeated on every row.
      const blockedReason =
        locked ??
        (spent ? 'Nothing more to gain this year' : unaffordable ? "You can't afford that" : null);

      return {
        id: a.id,
        icon: a.icon,
        label: a.label,
        // Warn before the tap, not after it.
        note: risky ? 'You have done this enough' : a.note,
        group: a.group,
        tint: tint.tint,
        noteColor: risky ? '#C4462E' : tint.noteColor,
        timesLeft,
        available: blockedReason === null && !state.activeEvent && state.character.alive,
        blockedReason,
        /** Greyed but visible: this is something to grow into, not an error. */
        locked: locked !== null,
      };
    });
};

/** Design 3B: a ladder with one named rival, and no org chart. */
export const workView = (state: LifeState, content: ContentPack) => {
  const job = state.career.current;
  if (!job) return null;
  const track = content.careersById.get(job.trackId);
  if (!track) return null;

  const rival = job.rivalNpcId ? state.npcs.find((n) => n.id === job.rivalNpcId) : null;
  const manager = job.managerNpcId ? state.npcs.find((n) => n.id === job.managerNpcId) : null;

  return {
    employer: job.employerName,
    title: job.title,
    salary: formatMoneyExact(job.salary),
    yearsIn: job.yearsAtEmployer,
    performance: job.performance,
    performanceLabel: PERFORMANCE_LABEL[performanceBand(job.performance)],
    outlook: outlookLine(job.performance, rival?.firstName ?? null),
    /** The work-only things to do, already filtered to what is possible. */
    actions: actionsView(state, content).filter((a) => a.group === 'work'),
    ladder: track.rungs.map((rung) => ({
      title: rung.title,
      salary: formatMoney(rung.salary),
      current: rung.id === job.rungId,
      reached: track.rungs.findIndex((r) => r.id === rung.id) <= track.rungs.findIndex((r) => r.id === job.rungId),
    })),
    people: [
      manager,
      rival,
      // Everyone else you work with, closest first.
      ...state.relationships
        .filter((r) => r.kind === 'colleague' && r.npcId !== rival?.id)
        .sort((a, b) => b.dimensions.closeness - a.dimensions.closeness)
        .slice(0, 4)
        .map((r) => state.npcs.find((n) => n.id === r.npcId)),
    ]
      .filter((n): n is NonNullable<typeof n> => !!n && n.alive)
      .map((n) => {
        const rel = state.relationships.find((r) => r.npcId === n.id);
        return {
          npcId: n.id,
          name: `${n.firstName} ${n.lastName}`,
          emoji: n.avatarEmoji,
          // Only the actual rival is after your job; the rest just work there.
          role:
            n.id === manager?.id
              ? 'Your manager'
              : n.id === rival?.id
                ? `Also up for ${nextTitle(track, job.rungId)}`
                : (n.occupation ?? 'You work together'),
          closeness: rel?.dimensions.closeness ?? 0,
          score: rel ? surfacedScore(rel) : 0,
        };
      }),
  };
};

const nextTitle = (track: { rungs: Array<{ id: string; title: string }> }, rungId: string): string => {
  const index = track.rungs.findIndex((r) => r.id === rungId);
  return track.rungs[index + 1]?.title ?? 'the same things you are';
};

const outlookLine = (performance: number, rivalName: string | null): string => {
  if (performance >= 78) {
    return rivalName
      ? `Two more good years and the next rung is yours. ${rivalName} is closer than you think.`
      : 'Two more good years and the next rung is yours.';
  }
  if (performance >= 55) return 'You are doing fine. Fine is not the same as next.';
  return 'Somebody has started using the word "fit" about you.';
};

/** Design 3C: plain language, no charts. */
export const moneyView = (state: LifeState, config: GameConfig, content: ContentPack) => {
  const monthly = monthlyLines(state, config);
  const monthlyNet = monthly.reduce((sum, line) => sum + line.cents, 0);

  return {
    netWorth: formatMoneyExact(netWorth(state)),
    monthlyNet: formatSigned(monthlyNet),
    debtCount: [
      state.character.finances.debt > 0,
      ...state.assets.map((a) => a.loanOutstanding > 0),
    ].filter(Boolean).length,
    forSale: shopView(state, content),
    /** Who you owe, what for, and at what rate. */
    debts: state.character.finances.debts
      .slice()
      .sort((a, b) => b.balance - a.balance)
      .map((d) => ({
        id: d.id,
        label: d.label,
        holder: d.holder,
        balance: formatMoneyExact(d.balance),
        rate: `${Math.round(d.rate * 100)}% a year`,
        sinceAge: d.takenAtAge,
      })),
    owned: [
      ...state.assets.map((a) => ({
        // Only real assets can be sold; a business is closed, not sold off here.
        assetId: a.id,
        emoji: a.emoji,
        label: a.label,
        detail:
          a.loanOutstanding > 0
            ? `${formatMoneyExact(a.value)} · ${formatMoneyExact(a.loanOutstanding)} left on the loan`
            : formatMoneyExact(a.value),
      })),
      ...state.businesses
        .filter((b) => !b.closed)
        .map((b) => ({
          assetId: null,
          emoji: b.emoji,
          label: b.name,
          detail: `Your company · ${b.units} ${b.unitLabel} · ${b.employees} staff`,
        })),
      ...(state.character.finances.savings > 0
        ? [
            {
              emoji: '📈',
              label: 'Savings',
              detail: `${formatMoneyExact(state.character.finances.savings)} · quietly growing`,
            },
          ]
        : []),
    ],
    monthly: monthly.map((line) => ({
      icon: line.icon,
      label: line.label,
      amount: formatSigned(line.cents),
      positive: line.cents >= 0,
    })),
    note: humanCostNote(state),
  };
};

/** The line at the bottom of design 3C — a human cost, not a chart. */
const humanCostNote = (state: LifeState): string | null => {
  for (const rel of state.relationships) {
    const debt = rel.memories.find((m) => m.factKey === 'owes_you_money' && !m.resolved);
    if (debt) {
      const npc = state.npcs.find((n) => n.id === rel.npcId);
      const years = state.character.age - debt.atAge;
      const amount = typeof debt.data.amount === 'number' ? formatMoneyExact(debt.data.amount) : 'money';
      return `${npc?.firstName ?? 'Someone'} still owes you ${amount} from ${years} years ago. Asking for it back would cost you something else.`;
    }
  }
  if (state.character.finances.debt > 0) {
    return `You owe ${formatMoneyExact(state.character.finances.debt)}. It is not urgent, which is how it stays.`;
  }
  return null;
};

/** Design 3A / 5A. */
export const schoolView = (state: LifeState, content: ContentPack) => {
  const e = state.education.current;
  if (!e) return null;

  // Design 3A "YOUR CLASS": the people school actually puts in front of you.
  const byId = new Map(state.npcs.map((n) => [n.id, n]));
  const classmates = state.relationships
    .filter((r) => r.kind === 'classmate' || r.kind === 'teacher')
    .map((r) => ({ rel: r, npc: byId.get(r.npcId) }))
    .filter((x): x is { rel: (typeof state.relationships)[number]; npc: Npc } => !!x.npc && x.npc.alive)
    .sort((a, b) => b.rel.dimensions.closeness - a.rel.dimensions.closeness)
    .slice(0, 6)
    .map(({ rel, npc }) => ({
      npcId: npc.id,
      name: `${npc.firstName} ${npc.lastName}`,
      emoji: npc.avatarEmoji,
      note: rel.subtitle || npc.descriptor,
      closeness: rel.dimensions.closeness,
      isTeacher: rel.kind === 'teacher',
    }));

  return {
    classmates,
    /** The school-only things to do, already filtered to what is possible. */
    actions: actionsView(state, content).filter((a) => a.group === 'school'),
    institution: e.institutionName,
    stage: e.stage,
    major: e.major,
    yearLine:
      e.stage === 'university' || e.stage === 'graduate'
        ? `Year ${e.yearIndex} · GPA ${gpa(e.gradePoints)}`
        : `${e.yearIndex}${ordinal(e.yearIndex)} year · ${gradeLetter(e.gradePoints)} average`,
    debt: e.debtIncurred > 0 ? formatSigned(-e.debtIncurred) : null,
    subjects: e.subjects.map((s) => ({ name: s.name, grade: gradeLetter(s.gradePoints) })),
    clubs: e.clubIds,
    clubSlots: e.clubSlots,
    popularity: e.popularity,
    gradePoints: e.gradePoints,
  };
};

const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
};

/** Design 4B: each tile carries its current state so the drawer answers questions. */
export const moreView = (state: LifeState) => {
  const business = state.businesses.find((b) => !b.closed);
  const record = state.character.record;
  const watching = state.character.conditions.filter((c) => !c.treated).length;

  return {
    tiles: [
      { id: 'business', icon: '🚚', label: 'Your company', value: business?.name ?? 'None' },
      { id: 'property', icon: '🏠', label: 'Property', value: `${state.assets.length} place${state.assets.length === 1 ? '' : 's'}` },
      { id: 'politics', icon: '🏛️', label: 'Local politics', value: state.flags.in_politics ? 'Involved' : 'Not involved' },
      {
        id: 'record',
        icon: '⚖️',
        label: 'Record',
        value: record.convictions.length === 0 ? 'Clean' : `${record.convictions.length} conviction${record.convictions.length === 1 ? '' : 's'}`,
      },
      { id: 'health', icon: '🩺', label: 'Health', value: watching === 0 ? 'Nothing to watch' : `${watching} thing${watching === 1 ? '' : 's'} to watch` },
      { id: 'will', icon: '📜', label: 'Your will', value: state.flags.will_written ? 'Written' : 'Not written' },
    ],
    storySoFar: storySoFar(state),
    family: {
      name: `The ${state.lineage.familyName}s`,
      line: `${ordinalGeneration(state.lineage.generation)} generation · ${state.relationships.filter((r) => r.kind === 'child').length} kid${state.relationships.filter((r) => r.kind === 'child').length === 1 ? '' : 's'}`,
    },
  };
};

const ordinalGeneration = (n: number): string => `${n}${ordinal(n)}`;

const storySoFar = (state: LifeState): string => {
  const parts: string[] = [`${state.character.age} years.`];
  const business = state.businesses.find((b) => !b.closed);
  if (business) parts.push('One company');
  const house = state.assets.find((a) => a.kind === 'house');
  if (house) parts.push('one house');
  const oldest = state.relationships
    .filter((r) => r.kind !== 'mother' && r.kind !== 'father')
    .sort((a, b) => a.sinceAge - b.sinceAge)[0];
  if (oldest) {
    const npc = state.npcs.find((n) => n.id === oldest.npcId);
    if (npc) parts.push(`one person who's been there since you were ${oldest.sinceAge}`);
  }
  const debt = state.relationships
    .flatMap((r) => r.memories)
    .find((m) => m.factKey === 'owes_you_money' && !m.resolved);
  if (debt && typeof debt.data.amount === 'number') {
    parts.push(`and ${formatMoneyExact(debt.data.amount)} you'll probably never see again`);
  }
  return parts.join(', ').replace(/,([^,]*)$/, ',$1') + '.';
};

/**
 * Prison, as a place rather than a state.
 *
 * BitLife replaces the Occupation slot with a Prison one and gives it its own
 * screen — sentence, behaviour, and a menu of things to do with the years. Ours
 * said "You are serving a sentence." and nothing else, which is exactly the
 * "half baked" the player meant: a decade of a life with no surface at all.
 * See docs/BITLIFE-LOOP-SPEC.md §5.
 */
export const prisonView = (state: LifeState, content: ContentPack) => {
  const inside = state.character.record.incarceration;
  if (!inside) return null;

  const left = Math.max(0, inside.totalYears - inside.yearsServed);
  const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;

  return {
    facility: inside.facility,
    offence: inside.offence,
    sentence: `${years(inside.yearsServed)} of ${years(inside.totalYears)} served`,
    yearsLeft: left,
    served: Math.round((inside.yearsServed / inside.totalYears) * 100),
    behaviour: inside.behaviour,
    behaviourLabel:
      inside.behaviour >= 75
        ? 'Model prisoner'
        : inside.behaviour >= 45
          ? 'No trouble so far'
          : 'A problem, on paper',
    parole:
      inside.paroleEligibleIn > 0
        ? `Eligible for parole in ${years(inside.paroleEligibleIn)}`
        : 'Eligible for parole now',
    /** Everyone you are in here with. */
    inmates: state.relationships
      .filter((r) => r.kind === 'cellmate')
      .map((rel) => {
        const npc = state.npcs.find((n) => n.id === rel.npcId);
        return npc
          ? { npcId: npc.id, name: `${npc.firstName} ${npc.lastName}`, emoji: npc.avatarEmoji }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    /*
     * Only what there is to do in here. A row whose entire message is "not from
     * in here" is noise on the one screen where that is true of everything —
     * the prison menu should read as a set of options, not a list of refusals.
     */
    actions: actionsView(state, content).filter(
      (a) =>
        (a.group === 'prison' || a.group === 'body_and_head' || a.group === 'school') &&
        a.blockedReason !== 'Not from in here',
    ),
  };
};
