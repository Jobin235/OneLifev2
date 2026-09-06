import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { Ancestor, Legacy, LifeState, Npc } from '@lineage/shared-types';
import { formatMoney, netWorth, surfacedScore } from '@lineage/simulation';
import { rankHeirs } from '@lineage/npc-engine';
import { buildChapters } from '@lineage/narrative';

/**
 * Design 4C. The legacy screen is not a score screen — it is the last thing the
 * player reads about this person, so every figure on it has to be a fact the
 * simulation actually recorded rather than a number it can total up.
 */
export const buildLegacy = (state: LifeState, content: ContentPack, config: GameConfig): Legacy => {
  const { character } = state;
  const age = character.deathAge ?? character.age;
  const diedYear = character.birthYear + age;
  const country = content.countriesById.get(character.countryId);
  const city = country?.cities.find((c) => c.id === character.cityId);

  const estate = Math.max(0, netWorth(state));
  const children = state.relationships.filter((r) => r.kind === 'child');
  const businessYears = state.businesses.reduce(
    (max, b) => Math.max(max, age - b.foundedAtAge),
    0,
  );
  const lifetimeEmployees = state.businesses.reduce((sum, b) => sum + b.lifetimeEmployees, 0);

  return {
    name: `${character.firstName} ${character.lastName}`,
    bornYear: character.birthYear,
    diedYear,
    age,
    cityName: city?.name ?? 'somewhere',
    epitaph: epitaphFor(state),
    chapters: buildChapters(state, config),
    howPeopleSawYou: howPeopleSawYou(state),
    whatYouChanged: whatYouChanged(state, lifetimeEmployees, businessYears),
    numbers: [
      { value: String(age), label: 'years lived' },
      { value: formatMoney(estate), label: 'estate' },
      { value: String(children.length), label: children.length === 1 ? 'child' : 'children' },
      { value: businessYears > 0 ? String(businessYears) : '—', label: 'yrs of business' },
      { value: state.flags.passed_a_law ? '1' : '0', label: 'laws passed' },
      {
        value: character.fame.reach === 'none' ? '0' : String(Math.round(character.fame.following / 1000)) + 'k',
        label: character.fame.reach === 'none' ? 'times famous' : 'following',
      },
    ],
    comparison: comparisonLine(state, estate),
    whatYouLeft: whatYouLeft(state, estate),
    heirs: heirOptions(state),
  };
};

const epitaphFor = (state: LifeState): string => {
  const { character } = state;
  const cause = character.causeOfDeath ?? 'age';
  const house = state.assets.some((a) => a.kind === 'house');
  const business = state.businesses.some((b) => !b.closed);

  if (cause === 'age') {
    const trimmings = [
      house ? 'with the house paid off' : 'in rented rooms',
      business ? 'and the company still running' : null,
    ].filter(Boolean);
    return `Died in ${character.sex === 'female' ? 'her' : 'their'} sleep, at home, ${trimmings.join(' ')}.`.replace(
      / ,/g,
      ',',
    );
  }
  return `Died at ${character.deathAge}, of ${cause}.`;
};

/**
 * Design 4C's "HOW PEOPLE SAW HIM" — grouped by who, with a verdict and a line,
 * and a deliberate last row that says most people never heard of you.
 */
const howPeopleSawYou = (state: LifeState): Legacy['howPeopleSawYou'] => {
  const rows: Legacy['howPeopleSawYou'] = [];

  const family = state.relationships.filter((r) =>
    ['spouse', 'child', 'mother', 'father', 'sibling'].includes(r.kind),
  );
  if (family.length > 0) {
    const score = Math.round(family.reduce((sum, r) => sum + surfacedScore(r), 0) / family.length);
    const estranged = family.filter((r) => r.dimensions.conflict > 55);
    rows.push({
      who: 'Their family',
      verdict: score >= 75 ? 'Loved' : score >= 50 ? 'Loved, mostly' : 'Complicated',
      line:
        estranged.length > 0
          ? `${nameOf(state, estranged[0]!.npcId)} came, and sat at the back.`
          : 'They were all there.',
      score,
    });
  }

  const employees = state.businesses.reduce((sum, b) => sum + b.lifetimeEmployees, 0);
  if (employees > 0) {
    rows.push({
      who: `The ${employees} people they employed`,
      verdict: 'Trusted',
      line: "Never missed a payroll, including the year they didn't pay themselves.",
      score: 78,
    });
  }

  if (state.flags.in_politics) {
    rows.push({
      who: 'Their town',
      verdict: state.flags.passed_a_law ? 'Respected, not liked' : 'Barely remembered',
      line: state.flags.passed_a_law
        ? 'Known as the one who got the ordinance through.'
        : 'One term, and then somebody else.',
      score: 62,
    });
  }

  rows.push({
    who: 'Everyone else',
    verdict: state.character.fame.reach === 'none' ? 'Never heard of them' : 'Recognised',
    line:
      state.character.fame.reach === 'none'
        ? 'They were never famous. Most people aren’t.'
        : `Known for ${state.character.fame.knownFor ?? 'something'}.`,
    score: state.character.fame.reach === 'none' ? 0 : 55,
  });

  return rows;
};

/** Only things that outlived them. An empty list is an honest outcome. */
const whatYouChanged = (
  state: LifeState,
  lifetimeEmployees: number,
  businessYears: number,
): Legacy['whatYouChanged'] => {
  const changed: Legacy['whatYouChanged'] = [];

  if (lifetimeEmployees > 0) {
    changed.push({
      icon: '💼',
      line: `${lifetimeEmployees} people drew a wage from their company over ${businessYears} years.`,
    });
  }
  if (state.flags.passed_a_law) {
    changed.push({
      icon: '⚖️',
      line: 'The ordinance they pushed through is still law. It is the only thing they did that a stranger might benefit from today.',
    });
  }
  for (const institution of state.lineage.institutions) {
    changed.push({ icon: institution.emoji, line: `${institution.label} is still running.` });
  }
  if (state.flags.owns_childhood_home) {
    changed.push({ icon: '🏠', line: 'They kept their parents’ house in the family.' });
  }

  const estranged = state.relationships.find(
    (r) => r.kind === 'child' && r.dimensions.conflict > 55,
  );
  if (estranged) {
    const years = state.character.age - estranged.lastContactAge;
    changed.push({
      icon: '🕳️',
      line: `And one thing they never fixed: they stopped speaking to ${nameOf(state, estranged.npcId)} for ${years} years and died before either of them moved.`,
    });
  }

  if (changed.length === 0) {
    changed.push({
      icon: '🌱',
      line: 'Nothing outlasted them that a stranger would notice. That is true of nearly everybody.',
    });
  }
  return changed;
};

const comparisonLine = (state: LifeState, estate: number): string => {
  // Rough percentile bands. This is flavour, and it is honest about being flavour.
  const wealthPct = Math.min(99, Math.round(100 * (1 - Math.exp(-estate / 40_000_000))));
  const happyPct = Math.min(99, Math.max(1, state.character.stats.happiness));
  const remembered =
    state.character.fame.following > 0
      ? state.character.fame.following.toLocaleString('en-US')
      : String(
          Math.max(
            8,
            state.relationships.length * 12 +
              state.businesses.reduce((s, b) => s + b.lifetimeEmployees, 0) * 4,
          ),
        );
  return `Wealthier than ${wealthPct}% of people alive in their country when they died. Happier than ${happyPct}% of them. Remembered by roughly ${remembered}.`;
};

const whatYouLeft = (state: LifeState, estate: number): string[] => {
  const left: string[] = [`${formatMoney(estate)} estate`];
  const business = state.businesses.find((b) => !b.closed);
  if (business) left.push(`A company, ${business.employees} staff`);
  for (const institution of state.lineage.institutions) left.push(institution.label);
  if (state.flags.passed_a_law) left.push('One city ordinance');
  if (state.character.record.convictions.length === 0) left.push('A clean name');
  const estranged = state.relationships.find(
    (r) => r.kind === 'child' && r.dimensions.conflict > 55,
  );
  if (estranged) left.push(`One angry ${sexWord(state, estranged.npcId)}`);
  return left;
};

/** Design 4C: heirs are pitched by what they'd be like to play, not what they get. */
const heirOptions = (state: LifeState): Legacy['heirs'] => {
  const heirs = rankHeirs(state).slice(0, 2);

  const options: Legacy['heirs'] = heirs.map(({ npc, relationship }) => ({
    npcId: npc.id,
    name: `${npc.firstName} ${npc.lastName}, ${npc.age}`,
    emoji: npc.avatarEmoji,
    pitch: heirPitch(state, npc, surfacedScore(relationship)),
  }));

  options.push({
    npcId: null,
    name: 'Somebody new',
    emoji: '👶',
    pitch: 'Start from nothing, somewhere else.',
  });
  return options;
};

const heirPitch = (state: LifeState, npc: Npc, score: number): string => {
  const business = state.businesses.find((b) => !b.closed);
  const rich = netWorth(state) > 50_000_000;
  const relation = npc.sex === 'female' ? 'Your daughter.' : 'Your son.';

  if (score >= 65 && business) return `${relation} Runs the company. Grew up ${rich ? 'rich' : 'in it'}.`;
  if (score < 40) return `${relation} Owns nothing. Resents everything.`;
  return `${relation} ${rich ? 'Grew up comfortable and knows it.' : 'Starting more or less where you did.'}`;
};

const nameOf = (state: LifeState, npcId: string): string =>
  state.npcs.find((n) => n.id === npcId)?.firstName ?? 'they';

const sexWord = (state: LifeState, npcId: string): string =>
  state.npcs.find((n) => n.id === npcId)?.sex === 'female' ? 'daughter' : 'son';

/** What the next generation inherits when the player carries the line on. */
export const toAncestor = (state: LifeState, heirCount: number): Ancestor => {
  const estate = Math.max(0, netWorth(state));
  return {
    name: `${state.character.firstName} ${state.character.lastName}`,
    bornYear: state.character.birthYear,
    diedYear: state.character.birthYear + (state.character.deathAge ?? state.character.age),
    age: state.character.deathAge ?? state.character.age,
    epitaph: epitaphFor(state),
    // Split between heirs, minus what the estate loses on the way through.
    estatePassedOn: heirCount > 0 ? Math.round((estate * 0.85) / heirCount) : 0,
    notableIds: Object.keys(state.flags).filter((key) =>
      ['passed_a_law', 'owns_childhood_home', 'refused_to_sell', 'scaled_business'].includes(key),
    ),
  };
};
