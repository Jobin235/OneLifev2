import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { LifeState } from '@lineage/shared-types';
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
  netWorth,
  performanceBand,
  PERFORMANCE_LABEL,
  relationshipLabel,
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
    money: formatMoneyExact(character.finances.cash + character.finances.savings),
    gameState: state.gameState,
    activeEvent: state.activeEvent,
    resolvedEvent: state.resolvedEvent,
    earlierThisYear: state.currentYearEntryIds
      .map((id) => state.history.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .slice(-4)
      .reverse()
      .map((e) => ({ icon: e.icon, text: e.line })),
    quickActions: actionsView(state, content).slice(0, 6),
    actionsRemaining: state.actionsRemaining,
    actionsPerYear: state.actionsPerYear,
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
export const personView = (state: LifeState, npcId: string, config: GameConfig) => {
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
};

export const actionsView = (state: LifeState, content: ContentPack) => {
  const liquid = state.character.finances.cash + state.character.finances.savings;

  return content.activities
    .filter((a) => state.character.age >= a.minAge && state.character.age <= a.maxAge)
    .filter((a) => {
      if (a.group === 'work') return state.career.current !== null;
      if (a.group === 'school') return state.education.current !== null;
      if (a.group === 'relationship') {
        if (a.id === 'call_your_mom') return state.relationships.some((r) => r.kind === 'mother');
        return state.relationships.some((r) => r.kind === 'partner' || r.kind === 'spouse');
      }
      return true;
    })
    .map((a) => {
      const tint = GROUP_TINT[a.group] ?? GROUP_TINT.bigger_moves!;
      const unaffordable = a.cost > liquid;
      const noActions = a.costsAction && state.actionsRemaining <= 0;
      return {
        id: a.id,
        icon: a.icon,
        label: a.label,
        note: a.note,
        group: a.group,
        tint: tint.tint,
        noteColor: tint.noteColor,
        available: !unaffordable && !noActions && !state.activeEvent && state.character.alive,
        blockedReason: unaffordable
          ? "You can't afford that"
          : noActions
            ? 'Nothing left this year'
            : state.activeEvent
              ? 'Answer the open decision first'
              : null,
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
    ladder: track.rungs.map((rung) => ({
      title: rung.title,
      salary: formatMoney(rung.salary),
      current: rung.id === job.rungId,
      reached: track.rungs.findIndex((r) => r.id === rung.id) <= track.rungs.findIndex((r) => r.id === job.rungId),
    })),
    people: [manager, rival]
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => {
        const rel = state.relationships.find((r) => r.npcId === n.id);
        return {
          npcId: n.id,
          name: `${n.firstName} ${n.lastName}`,
          emoji: n.avatarEmoji,
          subtitle: n.id === manager?.id ? 'Your manager' : `Also up for ${nextTitle(track, job.rungId)}`,
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
export const moneyView = (state: LifeState, config: GameConfig) => {
  const monthly = monthlyLines(state, config);
  const monthlyNet = monthly.reduce((sum, line) => sum + line.cents, 0);

  return {
    netWorth: formatMoneyExact(netWorth(state)),
    monthlyNet: formatSigned(monthlyNet),
    debtCount: [
      state.character.finances.debt > 0,
      ...state.assets.map((a) => a.loanOutstanding > 0),
    ].filter(Boolean).length,
    owned: [
      ...state.assets.map((a) => ({
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
export const schoolView = (state: LifeState) => {
  const e = state.education.current;
  if (!e) return null;
  return {
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
