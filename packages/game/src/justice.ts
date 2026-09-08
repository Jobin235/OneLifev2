import type { ContentPack } from '@lineage/content';
import type { LifeState } from '@lineage/shared-types';
import { clampStat, } from '@lineage/shared-types';
import { formatMoneyExact, makeId, makeRng, pushHistory, type Rng } from '@lineage/simulation';
import { instantiate } from '@lineage/event-engine';

/**
 * Being caught.
 *
 * A crime that went wrong used to convict you on the spot: the sentence was
 * written into the activity and nothing in between was yours. BitLife puts two
 * decisions in the gap — which lawyer you can afford, and how you plead — and
 * they are the reason getting caught is a story rather than a penalty. The
 * expensive firm is visibly better and you pay it whatever happens, which is the
 * same shape the doctor uses. See docs/BITLIFE-LOOP-SPEC.md §5, Justice.
 */

interface Firm {
  name: string;
  fee: number;
  /** 0..100, drawn as a bar. It is the odds, and it is never stated. */
  standing: number;
}

const FIRM_NAMES = [
  'Henderson & Associates',
  'Gulch & Associates',
  'Marchetti and Doyle',
  'Whitlock Legal',
  'Ashcroft & Pike',
  'Delacroix Defence',
  'Barrow & Finch',
  'Osei and Partners',
];

/**
 * Three ways to be defended, and the money is the whole difference. The fees
 * scale with the sentence at stake — nobody charges bank-robbery money to defend
 * a shoplifting charge.
 */
const pickFirms = (sentenceYears: number, rng: Rng): [Firm, Firm, Firm] => {
  const [good, mid] = rng.shuffle(FIRM_NAMES).slice(0, 2);
  const weight = Math.max(1, sentenceYears);
  return [
    {
      name: good!,
      fee: Math.round((90_000 + weight * 130_000) * (0.85 + rng.next() * 0.4)),
      standing: rng.int(74, 93),
    },
    {
      name: mid!,
      fee: Math.round((14_000 + weight * 16_000) * (0.85 + rng.next() * 0.4)),
      standing: rng.int(45, 63),
    },
    { name: 'A public defender', fee: 0, standing: rng.int(18, 34) },
  ];
};

export interface ChargeInput {
  offence: string;
  sentenceYears: number;
  fine: number;
  facility: string;
}

/**
 * Opens the charge sheet. As with the interview and the doctor, the specifics
 * ride in flags so one authored event covers every offence in the game.
 */
export const openCharges = (
  state: LifeState,
  charge: ChargeInput,
  content: ContentPack,
  rng: Rng,
): boolean => {
  const definition = content.eventsById.get('criminal_charges');
  if (!definition) return false;

  const [good, mid, free] = pickFirms(charge.sentenceYears, rng);

  state.flags.charge_offence = charge.offence;
  state.flags.charge_years = charge.sentenceYears;
  state.flags.charge_fine = charge.fine;
  state.flags.charge_facility = charge.facility;
  state.flags.charge_firm_a = good.name;
  state.flags.charge_firm_b = mid.name;
  state.flags.charge_firm_c = free.name;
  state.flags.charge_fee_a = good.fee;
  state.flags.charge_fee_b = mid.fee;
  state.flags.charge_fee_c = free.fee;
  state.flags.charge_price_a = formatMoneyExact(good.fee);
  state.flags.charge_price_b = formatMoneyExact(mid.fee);
  state.flags.charge_price_c = 'Free';
  state.flags.charge_result = '';
  state.flags.charge_result_title = '';
  state.flags.charge_history = `You were charged with ${charge.offence.toLowerCase()}.`;

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);

  const bars: Record<string, number> = { firm_a: good.standing, firm_b: mid.standing, firm_c: free.standing };
  for (const choice of instance.choices) {
    const bar = bars[choice.id];
    if (bar !== undefined) choice.quality = bar;
  }
  instance.stake = {
    label: 'Possible sentence',
    value: `${charge.sentenceYears} ${charge.sentenceYears === 1 ? 'year' : 'years'}`,
  };

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  return true;
};

/**
 * Takes the fee and opens the plea. You pay the lawyer whether or not they get
 * you off, which is what makes choosing one a decision rather than a preference.
 */
export const settleLawyer = (state: LifeState, tier: number, content: ContentPack): void => {
  const { character } = state;
  const suffix = tier === 0 ? 'a' : tier === 1 ? 'b' : 'c';
  const name = String(state.flags[`charge_firm_${suffix}`] ?? 'A public defender');
  const asked = Number(state.flags[`charge_fee_${suffix}`] ?? 0);

  const liquid = character.finances.cash + character.finances.savings;
  /*
   * Somebody who cannot pay does not go undefended: they get the public
   * defender, and the log says so. Refusing the choice outright would leave the
   * player stuck on a popup they cannot answer.
   */
  const affordable = asked <= liquid;
  const fee = affordable ? asked : 0;
  const firm = affordable ? name : 'A public defender';
  const standing = affordable
    ? tier === 0
      ? 84
      : tier === 1
        ? 54
        : 26
    : 26;

  if (fee > 0) {
    const fromCash = Math.min(character.finances.cash, fee);
    character.finances.cash -= fromCash;
    character.finances.savings -= fee - fromCash;
  }

  state.flags.charge_standing = standing;
  state.flags.charge_lawyer = firm;
  state.flags.charge_result_title = 'Representation';
  state.flags.charge_result = affordable
    ? `${firm} took the case.`
    : `You could not cover ${name}, so the court appointed somebody.`;
  state.flags.charge_history = affordable && fee > 0
    ? `You paid ${formatMoneyExact(fee)} to have ${firm} defend you.`
    : `You were defended by a public defender.`;

  openPlea(state, content);
};

/** The second half of the same moment: how you are going to answer the charge. */
const openPlea = (state: LifeState, content: ContentPack): void => {
  const definition = content.eventsById.get('criminal_plea');
  if (!definition) return;

  const years = Number(state.flags.charge_years ?? 1);
  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);
  instance.stake = {
    label: 'Possible sentence',
    value: `${years} ${years === 1 ? 'year' : 'years'}`,
  };

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
};

/**
 * The verdict.
 *
 * A guilty plea trades certainty for a shorter sentence. Not guilty is the only
 * way to walk out clean and the only way to serve the whole thing. No contest
 * splits the difference and keeps the fine down. The lawyer moves all three.
 */
export const settlePlea = (
  state: LifeState,
  how: 'guilty' | 'not_guilty' | 'no_contest',
): void => {
  const { character } = state;
  const offence = String(state.flags.charge_offence ?? 'the offence');
  const facility = String(state.flags.charge_facility ?? 'the county jail');
  const lawyer = String(state.flags.charge_lawyer ?? 'your lawyer');
  const standing = Number(state.flags.charge_standing ?? 26);
  const years = Number(state.flags.charge_years ?? 1);
  const fine = Number(state.flags.charge_fine ?? 0);

  const rng = makeRng(state.seed, 'plea', offence, character.age, how);

  /*
   * How well the defence goes. A good lawyer is worth a lot; being a plausible
   * person in the dock is worth something too, and a record is worth less than
   * nothing.
   */
  const priors = character.record.convictions.length;
  /*
   * And the kind of person you have been, which the character-witness half of
   * a trial is entirely about. Worth roughly a third of a good lawyer at the
   * extremes and nothing at all in the middle, so it rewards a life rather than
   * a gesture.
   */
  const defence =
    standing * 0.75 +
    character.stats.charm * 0.2 +
    character.hidden.luck * 0.15 +
    character.karma * 0.22 -
    priors * 9;

  const acquitChance =
    how === 'not_guilty'
      ? Math.max(0.04, Math.min(0.72, defence / 150))
      : how === 'no_contest'
        ? Math.max(0.02, Math.min(0.25, defence / 420))
        : 0;

  if (rng.chance(acquitChance)) {
    state.flags.charge_result_title = 'Not guilty';
    state.flags.charge_result = `${lawyer} took it apart in an afternoon. You walked out with nothing on your record.`;
    state.flags.charge_history = `You were acquitted of ${offence.toLowerCase()}.`;
    character.stats.happiness = clampStat(character.stats.happiness + 10);
    clearCharge(state);
    return;
  }

  /*
   * Convicted. The plea and the lawyer decide how long: pleading guilty is worth
   * roughly a third off, no contest a quarter, and fighting it and losing costs
   * you the discount you would have had.
   */
  const discount = how === 'guilty' ? 0.34 : how === 'no_contest' ? 0.24 : 0;
  const lawyerCut = (standing / 100) * 0.22;
  // Some offences carry a fine and a record but no cell, and a good lawyer can
  // argue a short sentence down to one of those.
  const served = years === 0 ? 0 : Math.max(0, Math.round(years * (1 - discount - lawyerCut)));
  const owed = Math.round(fine * (how === 'no_contest' ? 0.6 : 1));

  character.record.convictions.push({
    id: makeId('cnv', state.seed, offence, state.step),
    offence,
    atAge: character.age,
    sentenceYears: served,
    fine: owed,
    spent: false,
  });

  if (owed > 0) {
    const fromCash = Math.min(character.finances.cash, owed);
    character.finances.cash -= fromCash;
    character.finances.savings -= owed - fromCash;
  }

  if (served > 0 && state.career.current) {
    state.career.history.push({
      trackId: state.career.current.trackId,
      employerName: state.career.current.employerName,
      title: state.career.current.title,
      fromAge: character.age - state.career.current.yearsAtEmployer,
      toAge: character.age,
      endedBy: 'imprisoned',
    });
    state.career.current = null;
    character.finances.salary = 0;
  }

  if (served > 0) {
    character.record.incarceration = {
      facility,
      offence,
      totalYears: served,
      yearsServed: 0,
      paroleEligibleIn: Math.max(1, Math.floor(served / 2)),
      behaviour: 60,
    };
  }

  const term = `${served} ${served === 1 ? 'year' : 'years'}`;
  // "A public defender" is a phrase, not a name: it cannot keep its capital in
  // the middle of a sentence.
  const counsel = lawyer.startsWith('A ') ? lawyer.replace(/^A /, 'a ') : lawyer;
  state.flags.charge_result_title = 'Guilty';

  if (served === 0) {
    const penalty = owed > 0 ? `a ${formatMoneyExact(owed)} fine` : 'a caution';
    state.flags.charge_result = `${penalty} and a conviction on your record. You were home by six.`;
    state.flags.charge_history = `You were convicted of ${offence.toLowerCase()} and fined.`;
  } else {
    state.flags.charge_result =
      how === 'not_guilty'
        ? `The jury took ninety minutes. ${term} at ${facility}.`
        : `${term} at ${facility}, and ${counsel} said it could have been worse.`;
    state.flags.charge_history = `You were convicted of ${offence.toLowerCase()} and sentenced to ${term}.`;
  }
  clearCharge(state);
};

const clearCharge = (state: LifeState): void => {
  for (const key of Object.keys(state.flags)) {
    if (key.startsWith('charge_') && !key.startsWith('charge_result') && key !== 'charge_history') {
      delete state.flags[key];
    }
  }
  void pushHistory;
};
