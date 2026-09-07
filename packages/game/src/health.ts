import type { ContentPack } from '@lineage/content';
import type { HealthCondition, LifeState } from '@lineage/shared-types';
import { clampStat, } from '@lineage/shared-types';
import { formatMoneyExact, makeRng, pushHistory, type Rng } from '@lineage/simulation';
import { instantiate } from '@lineage/event-engine';

/**
 * Getting ill, and deciding what to do about it.
 *
 * Conditions used to be added silently: the character was simply diagnosed with
 * high blood pressure between one year and the next and lost health for ever,
 * with nothing to decide and nothing to pay. BitLife puts a symptom in front of
 * you and makes the treatment a purchase — an over-the-counter guess, a cheap
 * doctor, or an expensive one — so being ill is a decision about money rather
 * than a number quietly falling. See docs/BITLIFE-LOOP-SPEC.md §5.
 */

interface Doctor {
  name: string;
  fee: number;
  /** 0..100. Drawn as a bar; it is the odds, and it is not stated. */
  reputation: number;
}

const SURNAMES = [
  'Halloran',
  'Ruiz',
  'Okonjo',
  'Vasquez',
  'Lindqvist',
  'Mbeki',
  'Farrow',
  'Deshmukh',
  'Whitlock',
  'Nakamura',
];

/**
 * Two doctors, and the expensive one is better. Fees scale with the country's
 * patient share, so a symptom in a country with real public healthcare is a
 * different decision from the same symptom somewhere it is not.
 */
const pickDoctors = (patientShare: number, rng: Rng): [Doctor, Doctor] => {
  const [cheap, good] = rng.shuffle(SURNAMES).slice(0, 2);
  const scale = Math.max(0.08, patientShare);
  return [
    {
      name: `Dr. ${cheap}`,
      fee: Math.round(18_000 * scale + rng.int(0, 60) * 100),
      reputation: rng.int(30, 55),
    },
    {
      name: `Dr. ${good}`,
      fee: Math.round(140_000 * scale + rng.int(0, 400) * 100),
      reputation: rng.int(70, 94),
    },
  ];
};

const CONCERN: Record<string, number> = {
  anxiety: 40,
  bad_knee: 35,
  bad_back: 45,
  high_blood_pressure: 60,
  type_2_diabetes: 72,
  heart_disease: 88,
};

/**
 * Puts the symptom on screen. As with the interview, the specifics ride in
 * flags so one authored event covers every illness and every pair of doctors.
 */
export const openSymptom = (
  state: LifeState,
  condition: HealthCondition,
  patientShare: number,
  content: ContentPack,
  rng: Rng,
): boolean => {
  const definition = content.eventsById.get('health_symptom');
  if (!definition) return false;

  const [cheap, good] = pickDoctors(patientShare, rng);

  state.flags.symptom_condition = condition.id;
  /*
   * Stored without its article. Half the catalogue reads "a back that never came
   * right" and half reads "anxiety", and the sentences below all want "the
   * <thing>" — otherwise you get "got on top of the a back that never came
   * right", which is the sort of line a player never stops seeing.
   */
  /*
   * Two forms, because the sentences want different ones. Half the catalogue
   * reads "a back that never came right" and half reads "anxiety": the body says
   * "a doctor would call it <X>" and wants the article, while the outcomes say
   * "got on top of the <X>" and must not have it, or you get "the a back that
   * never came right" — the sort of line a player never stops seeing.
   */
  const label = condition.label.toLowerCase();
  state.flags.symptom_label = label.replace(/^(an?|the) /, '');
  state.flags.symptom_label_a = label;
  state.flags.symptom_concern = CONCERN[condition.id] ?? 50;
  state.flags.symptom_cheap_name = cheap.name;
  state.flags.symptom_cheap_fee = cheap.fee;
  state.flags.symptom_cheap_rep = cheap.reputation;
  state.flags.symptom_good_name = good.name;
  state.flags.symptom_good_fee = good.fee;
  state.flags.symptom_good_rep = good.reputation;
  state.flags.symptom_cheap_price = formatMoneyExact(cheap.fee);
  state.flags.symptom_good_price = formatMoneyExact(good.fee);
  state.flags.symptom_result = '';
  state.flags.symptom_result_title = '';

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);

  /*
   * The reputation bars are per-doctor and numeric, so they are set here rather
   * than in content — a bar is a fact about this consultation, not about the
   * event that describes consultations in general.
   */
  const bars: Record<string, number> = { see_cheap: cheap.reputation, see_good: good.reputation };
  for (const choice of instance.choices) {
    const bar = bars[choice.id];
    if (bar !== undefined) choice.quality = bar;
  }

  instance.stake = { label: 'Your concern', value: `${state.flags.symptom_concern}%` };

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  return true;
};

/** Resolves whichever row the player picked. Called from the deferred layer. */
export const settleTreatment = (state: LifeState, option: number): void => {
  const { character } = state;
  const conditionId = String(state.flags.symptom_condition ?? '');
  const label = String(state.flags.symptom_label ?? 'it');
  const condition = character.conditions.find((c) => c.id === conditionId);

  const rng = makeRng(state.seed, 'treatment', conditionId, character.age, option);

  const attempt = (name: string, fee: number, reputation: number) => {
    // You pay whether or not it works. That is what makes it a decision.
    const liquid = character.finances.cash + character.finances.savings;
    if (fee > liquid) {
      state.flags.symptom_result_title = 'Turned away';
      state.flags.symptom_result = `You could not cover ${name}'s fee, and left with the ${label} you came in with.`;
      return;
    }
    const fromCash = Math.min(character.finances.cash, fee);
    character.finances.cash -= fromCash;
    character.finances.savings -= fee - fromCash;

    if (rng.chance(reputation / 100)) {
      if (condition) condition.treated = true;
      character.stats.health = clampStat(character.stats.health + 6);
      state.flags.symptom_result_title = 'Treated';
      state.flags.symptom_result = `${name} got on top of the ${label}. It is being managed now.`;
    } else {
      state.flags.symptom_result_title = 'No better';
      state.flags.symptom_result = `${name} took the fee and the ${label} is exactly where it was.`;
    }
  };

  switch (option) {
    case 0:
      // Ignoring it is free, and the condition sits there untreated.
      state.flags.symptom_result_title = 'Left alone';
      state.flags.symptom_result = `You decided the ${label} was not worth a fuss.`;
      character.stats.happiness = clampStat(character.stats.happiness + 2);
      break;
    case 1: {
      // Over the counter: cheap, and it works about a fifth of the time.
      const cost = 1_200;
      character.finances.cash -= Math.min(character.finances.cash, cost);
      if (rng.chance(0.18) && condition) {
        condition.treated = true;
        state.flags.symptom_result_title = 'That did it';
        state.flags.symptom_result = `Whatever was in the box sorted the ${label} out. Nobody is more surprised than you.`;
      } else {
        state.flags.symptom_result_title = 'Worth a try';
        state.flags.symptom_result = `You took something over the counter and the ${label} carried on regardless.`;
      }
      break;
    }
    case 2:
      attempt(
        String(state.flags.symptom_cheap_name ?? 'The doctor'),
        Number(state.flags.symptom_cheap_fee ?? 0),
        Number(state.flags.symptom_cheap_rep ?? 40),
      );
      break;
    default:
      attempt(
        String(state.flags.symptom_good_name ?? 'The specialist'),
        Number(state.flags.symptom_good_fee ?? 0),
        Number(state.flags.symptom_good_rep ?? 80),
      );
      break;
  }

  state.flags.symptom_history = condition?.treated
    ? `You were treated for ${label}.`
    : `You have been diagnosed with ${label}.`;

  for (const key of Object.keys(state.flags)) {
    if (
      key.startsWith('symptom_') &&
      key !== 'symptom_result' &&
      key !== 'symptom_result_title' &&
      key !== 'symptom_history'
    ) {
      delete state.flags[key];
    }
  }
  void pushHistory;
};
