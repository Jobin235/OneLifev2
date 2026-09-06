import type { ContentPack } from '@lineage/content';
import type { CountryPack, LifeState } from '@lineage/shared-types';
import type { Rng } from '@lineage/simulation';
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
    });
    pushHistory(state, 'education', '🎒', 'You started school.', 40);
    return;
  }

  if (age === 11 && state.education.highestCompleted === 'primary') {
    enrol(state, {
      stage: 'secondary',
      institutionName: rng.pick(SECONDARY_NAMES),
      totalYears: Math.max(4, country.education.compulsoryUntilAge - 11),
      subjects: ['Math', 'English', 'Science', 'History'],
    });
    pushHistory(state, 'education', '🎒', `You started at ${state.education.current!.institutionName}.`, 45);
    return;
  }

  if (state.flags.enrol_university) {
    delete state.flags.enrol_university;
    const major = rng.pick(MAJORS);
    enrol(state, {
      stage: 'university',
      institutionName: rng.pick(UNIVERSITY_NAMES),
      major,
      totalYears: 4,
      subjects: [major, 'Statistics', 'An elective you picked badly'],
      debt: country.education.universityCost * 4,
      scholarship: state.character.stats.smarts >= 82 && rng.chance(0.4),
    });
    const debt = state.education.current!.debtIncurred;
    if (debt > 0) state.character.finances.debt += debt;
    pushHistory(
      state,
      'education',
      '🎓',
      debt > 0
        ? `You started ${major} at ${state.education.current!.institutionName}, on borrowed money.`
        : `You started ${major} at ${state.education.current!.institutionName}.`,
      65,
    );
    return;
  }

  if (state.flags.enrol_vocational) {
    delete state.flags.enrol_vocational;
    enrol(state, {
      stage: 'vocational',
      institutionName: rng.pick(TRADE_NAMES),
      major: rng.pick(TRADES),
      totalYears: 2,
      subjects: ['Practical', 'Theory', 'Safety'],
    });
    pushHistory(state, 'education', '🔧', `You started at ${state.education.current!.institutionName}.`, 55);
  }

  void content;
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

const enrol = (state: LifeState, input: EnrolInput): void => {
  state.education.current = {
    stage: input.stage,
    institutionName: input.institutionName,
    major: input.major ?? null,
    yearIndex: 1,
    totalYears: input.totalYears,
    gradePoints: Math.round(Math.min(400, state.character.stats.smarts * 3)),
    subjects: input.subjects.map((name) => ({
      name,
      gradePoints: Math.round(Math.min(400, state.character.stats.smarts * 3)),
    })),
    clubIds: [],
    clubSlots: 3,
    debtIncurred: input.scholarship ? 0 : (input.debt ?? 0),
    onScholarship: input.scholarship ?? false,
  };
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
