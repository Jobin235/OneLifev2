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

/* ------------------------------------------------------------------ *
 * The check-up
 * ------------------------------------------------------------------ */

/**
 * What is actually wrong with you, and which of it you are paying to fix.
 *
 * Conditions accumulate — measured, the median sixty-year-old is carrying four
 * untreated ones — and until now nothing ever asked about them again. They sat
 * in the save draining health with no decision attached, which is both the
 * wrong shape for a life simulator and the reason our late game was empty: 92%
 * of years after seventy had no decision in them at all.
 *
 * BitLife's answer is the one implemented here. The doctor reads the whole list
 * back at you, each with a price, and you pick one. See
 * docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

/** What one condition costs to see off, before the country's share of it. */
const treatmentPrice = (condition: HealthCondition, index: number): number => {
  // Something that drains more is something that costs more to stop draining.
  const base = 18_000 + condition.annualHealthDrain * 34_000;
  // Stable per condition rather than random per visit: a price you can save for.
  return base + (index % 5) * 9_000;
};

const listOf = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * Raises the card, when there is enough wrong to be worth an appointment.
 *
 * Deliberately not every year: a doctor's letter every twelve months about the
 * same four things is nagging rather than a decision.
 */
export const openCheckup = (
  state: LifeState,
  patientShare: number,
  content: ContentPack,
  rng: Rng,
): boolean => {
  const definition = content.eventsById.get('health_checkup');
  if (!definition) return false;

  const untreated = state.character.conditions.filter((c) => !c.treated);
  if (untreated.length === 0) return false;

  const priced = untreated.map((condition, index) => ({
    condition,
    price: Math.max(2_000, Math.round(treatmentPrice(condition, index) * patientShare)),
  }));

  state.flags.checkup_body = `${
    priced.length === 1
      ? `The one thing wrong with you is ${priced[0]!.condition.label.toLowerCase()}.`
      : `You are living with ${listOf(priced.map((p) => p.condition.label.toLowerCase()))}.`
  } Nothing here is going to get better on its own.`;
  state.flags.checkup_result = '';
  state.flags.checkup_result_title = '';
  for (const [i, row] of priced.entries()) {
    state.flags[`checkup_id_${i}`] = row.condition.id;
    state.flags[`checkup_price_${i}`] = row.price;
  }
  state.flags.checkup_count = priced.length;

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);

  /*
   * The options are this body's, so they are filled here rather than authored.
   * Same shape as the university major list: content declares the dropdown,
   * the simulation fills it.
   */
  instance.selects = [
    {
      id: 'which',
      label: 'Pick your treatment',
      options: priced.map((row, i) => ({
        value: String(i),
        label: `${row.condition.label} (${formatMoneyExact(row.price)})`,
      })),
    },
  ];
  instance.facts = [
    { label: 'Consultation', value: formatMoneyExact(Math.round(10_000 * patientShare)) },
    {
      label: 'Carrying',
      value: `${priced.length} ${priced.length === 1 ? 'thing' : 'things'}`,
    },
  ];

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  void rng;
  return true;
};

/** Pays for the one they picked. Called from the deferred layer. */
export const settleCheckup = (state: LifeState, selection: string): void => {
  const index = Number(selection || '0');
  const conditionId = String(state.flags[`checkup_id_${index}`] ?? '');
  const price = Number(state.flags[`checkup_price_${index}`] ?? 0);
  const condition = state.character.conditions.find((c) => c.id === conditionId);

  const clear = () => {
    for (const key of Object.keys(state.flags)) {
      if (key.startsWith('checkup_id_') || key.startsWith('checkup_price_')) delete state.flags[key];
    }
    delete state.flags.checkup_count;
    delete state.flags.checkup_body;
  };

  if (!condition) {
    state.flags.checkup_result_title = 'Nothing was done';
    state.flags.checkup_result = 'The appointment came and went.';
    state.flags.checkup_history = 'You went to the doctor and came away with nothing.';
    clear();
    return;
  }

  const purse = state.character.finances.cash + state.character.finances.savings;
  if (price > purse) {
    state.flags.checkup_result_title = 'You could not pay for it';
    state.flags.checkup_result = `Treating ${condition.label.toLowerCase()} costs ${formatMoneyExact(price)}, which you do not have.`;
    state.flags.checkup_history = `You could not afford to treat your ${condition.label.toLowerCase()}.`;
    state.character.stats.happiness = clampStat(state.character.stats.happiness - 6);
    clear();
    return;
  }

  const f = state.character.finances;
  const fromCash = Math.min(f.cash, price);
  f.cash -= fromCash;
  f.savings -= price - fromCash;

  condition.treated = true;
  state.character.stats.health = clampStat(
    state.character.stats.health + 4 + condition.annualHealthDrain * 2,
  );
  state.character.stats.happiness = clampStat(state.character.stats.happiness + 5);

  state.flags.checkup_result_title = 'That is one of them dealt with';
  state.flags.checkup_result = `${formatMoneyExact(price)}, and your ${condition.label.toLowerCase()} is somebody else's problem now.`;
  state.flags.checkup_history = `You paid ${formatMoneyExact(price)} to have your ${condition.label.toLowerCase()} treated.`;
  clear();
};
