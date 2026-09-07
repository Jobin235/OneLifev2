import type { ContentPack } from '@lineage/content';
import type { CountryPack, LifeState } from '@lineage/shared-types';
import type { Rng } from '@lineage/simulation';
import { makeId } from '@lineage/simulation';
import { spawnNpc } from '@lineage/npc-engine';
import { pushHistory } from './ageup.js';

/**
 * Schooling happens to you until it doesn't.
 *
 * Primary and secondary enrol automatically at the country's ages — a seven-year-old
 * does not choose to go to school. Everything after eighteen is a decision, made by
 * the `school_what_next` event, which sets a flag this reads.
 */
export const advanceSchooling = (
  state: LifeState,
  country: CountryPack,
  content: ContentPack,
  rng: Rng,
): void => {
  const { age } = state.character;
  if (state.education.current) return;
  if (state.character.record.incarceration) return;

  if (age === 5 && state.education.highestCompleted === 'none') {
    enrol(state, {
      stage: 'primary',
      institutionName: rng.pick(PRIMARY_NAMES),
      totalYears: 6,
      subjects: ['Reading', 'Numbers', 'The world'],
    }, content, country, rng);
    pushHistory(state, 'education', '🎒', 'You started school.', 40);
    return;
  }

  if (age === 11 && state.education.highestCompleted === 'primary') {
    enrol(state, {
      stage: 'secondary',
      institutionName: rng.pick(SECONDARY_NAMES),
      totalYears: Math.max(4, country.education.compulsoryUntilAge - 11),
      subjects: ['Math', 'English', 'Science', 'History'],
    }, content, country, rng);
    pushHistory(
      state,
      'education',
      '🎒',
      `You started at ${state.education.current!.institutionName}.`,
      45,
    );
    return;
  }

  if (state.flags.enrol_university) {
    delete state.flags.enrol_university;
    /*
     * The major is the player's, chosen in the dropdown on the popup that got
     * them here. Rolling it was the single worst thing about this system: the
     * one education decision that shapes forty years of work was a die roll the
     * player watched happen.
     */
    const major = typeof state.flags.select_major === 'string' ? state.flags.select_major : rng.pick(MAJORS);
    enrol(state, {
      stage: 'university',
      institutionName: rng.pick(UNIVERSITY_NAMES),
      major,
      totalYears: 4,
      subjects: [major, 'Statistics', 'An elective you picked badly'],
      debt: country.education.universityCost * 4,
      scholarship: state.character.stats.smarts >= 82 && rng.chance(0.4),
    }, content, country, rng);
    const debt = state.education.current!.debtIncurred;
    if (debt > 0) {
      // Named, so the Money screen can say what the balance is and who holds it.
      state.character.finances.debts.push({
        id: makeId('debt', state.seed, 'student', state.character.age),
        label: `Student loan · ${state.education.current!.institutionName}`,
        holder: 'the student loans company',
        balance: debt,
        rate: 0.045,
        originalAmount: debt,
        takenAtAge: state.character.age,
      });
      state.character.finances.debt = state.character.finances.debts.reduce(
        (sum, d) => sum + d.balance,
        0,
      );
    }
    pushHistory(
      state,
      'education',
      '🎓',
      debt > 0
        ? `You started ${major} at ${state.education.current!.institutionName}.`
        : `You started ${major} at ${state.education.current!.institutionName}, on a scholarship.`,
      65,
    );
    if (debt > 0) {
      pushHistory(
        state,
        'money',
        '🏦',
        'You took out a student loan to pay for your university tuition.',
        55,
      );
    }
    return;
  }

  if (state.flags.enrol_vocational) {
    delete state.flags.enrol_vocational;
    enrol(state, {
      stage: 'vocational',
      institutionName: rng.pick(TRADE_NAMES),
      major: typeof state.flags.select_trade === 'string' ? state.flags.select_trade : rng.pick(TRADES),
      totalYears: 2,
      subjects: ['Practical', 'Theory', 'Safety'],
    }, content, country, rng);
    pushHistory(
      state,
      'education',
      '🔧',
      `You started at ${state.education.current!.institutionName}.`,
      55,
    );
  }
};

interface EnrolInput {
  stage: 'primary' | 'secondary' | 'vocational' | 'university' | 'graduate';
  institutionName: string;
  major?: string;
  totalYears: number;
  subjects: string[];
  debt?: number;
  scholarship?: boolean;
}

/**
 * Starting somewhere new puts people in front of you.
 *
 * This is the design's central continuity bet — a classmate met at 15 is the
 * person who turns up again at 24 — and it only works if school actually
 * introduces anyone. It previously introduced nobody, which left "YOUR CLASS"
 * empty and made school a progress bar with a name on it.
 */
const populateClass = (
  state: LifeState,
  stage: EnrolInput['stage'],
  content: ContentPack,
  country: CountryPack,
  rng: Rng,
): void => {
  const templateIds =
    stage === 'university' || stage === 'graduate'
      ? ['classmate', 'classmate', 'school_friend', 'professor']
      : stage === 'vocational'
        ? ['classmate', 'school_friend', 'teacher']
        : ['classmate', 'classmate', 'school_friend', 'teacher'];

  /*
   * Avoid handing the same first name to two people in one class. It is not
   * impossible in life, but on a six-row list it reads as a bug, and the names
   * are the only thing distinguishing these people at a glance.
   */
  const taken = new Set(state.npcs.filter((n) => n.alive).map((n) => n.firstName));

  for (const templateId of templateIds) {
    const template = content.npcTemplates.find((t) => t.id === templateId);
    if (!template) continue;

    let spawned = spawnNpc({ state, template, country, traits: content.traits, rng });
    for (let attempt = 0; attempt < 4 && taken.has(spawned.npc.firstName); attempt++) {
      // Undo and try again; spawnNpc registers as it goes.
      state.npcs.pop();
      state.relationships.pop();
      spawned = spawnNpc({ state, template, country, traits: content.traits, rng });
    }
    taken.add(spawned.npc.firstName);
  }
};

const enrol = (
  state: LifeState,
  input: EnrolInput,
  content: ContentPack,
  country: CountryPack,
  rng: Rng,
): void => {
  const startingGrade = Math.round(Math.min(400, state.character.stats.smarts * 3));

  state.education.current = {
    stage: input.stage,
    institutionName: input.institutionName,
    major: input.major ?? null,
    yearIndex: 1,
    totalYears: input.totalYears,
    gradePoints: startingGrade,
    // You arrive with whatever standing your charm buys you, and change it from there.
    popularity: Math.round(state.character.stats.charm * 0.8 + 10),
    subjects: input.subjects.map((name) => ({ name, gradePoints: startingGrade })),
    clubIds: [],
    clubSlots: 3,
    debtIncurred: input.scholarship ? 0 : (input.debt ?? 0),
    onScholarship: input.scholarship ?? false,
  };

  populateClass(state, input.stage, content, country, rng);
};

/** Called after graduation so the player is told, in a sentence, what changed. */
export const graduationLine = (
  stage: string,
  institutionName: string,
  completed: boolean,
): string => {
  if (!completed) return `You left ${institutionName} without finishing.`;
  switch (stage) {
    case 'primary':
      return 'You finished primary school. Everyone does.';
    case 'secondary':
      return `You graduated from ${institutionName}.`;
    case 'vocational':
      return `You qualified at ${institutionName}.`;
    case 'university':
      return `You graduated from ${institutionName}.`;
    default:
      return `You finished at ${institutionName}.`;
  }
};

const PRIMARY_NAMES = ['Alder Street Primary', 'Beckett Elementary', 'St. Ann’s Primary'];
const SECONDARY_NAMES = ['Lincoln High', 'Grantham Secondary', 'Northgate High', 'Ravensworth School'];
const UNIVERSITY_NAMES = ['Portland State', 'Fairbourne University', 'Kestrel College', 'The state university'];
const TRADE_NAMES = ['Ridgeway Technical', 'The trade college', 'Marlowe Institute'];
const MAJORS = [
  'Computer Science',
  'Business',
  'Nursing',
  'English',
  'Engineering',
  'Economics',
  'Psychology',
  'Law',
  'Biology',
];
const TRADES = ['Electrical', 'Plumbing', 'Welding', 'Automotive'];
