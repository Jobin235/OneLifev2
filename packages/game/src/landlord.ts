import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { Asset, LifeState } from '@lineage/shared-types';
import {
  checkInvariants,
  formatMoneyExact,
  makeRng,
  pushHistory,
  refreshDerived,
  type Rng,
} from '@lineage/simulation';
import { instantiate } from '@lineage/event-engine';

/**
 * Being a landlord.
 *
 * Property was a thing you owned; this makes it a thing that pays you and asks
 * for something back. BitLife runs it on two meters — property condition and
 * tenant satisfaction — with a background check you can pay for before you hand
 * anybody the keys, amenities that raise what the place is worth and what it
 * lets for, and an eviction that costs you the deposit you are holding.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 *
 * It sits directly on the mortgage work: the property you let is the property
 * you financed, and the rent is set against what it is worth today.
 */

export class LandlordRejected extends Error {}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** Only somewhere people live. Nobody rents your car. */
export const isLettable = (asset: Asset): boolean =>
  asset.kind === 'house' || asset.kind === 'apartment';

export interface Amenity {
  id: string;
  label: string;
  emoji: string;
  cost: number;
  /** What it adds to the property's value, as a share of the cost. */
  valueShare: number;
  /** What it adds to the rent it commands, as a share. */
  rentLift: number;
  note: string;
}

/**
 * BitLife's list, roughly: a home theatre, an infinity pool, a hot tub, a panic
 * room. Some of them pay for themselves in rent and some are for the person
 * living there, which is the joke.
 */
export const AMENITIES: Amenity[] = [
  { id: 'new_kitchen', label: 'A new kitchen', emoji: '🍳', cost: 1_800_000, valueShare: 1.15, rentLift: 0.1, note: 'The one that always pays' },
  { id: 'new_bathroom', label: 'A second bathroom', emoji: '🛁', cost: 2_400_000, valueShare: 1.2, rentLift: 0.12, note: 'Worth more than it costs' },
  { id: 'hot_tub', label: 'A hot tub', emoji: '🛀', cost: 900_000, valueShare: 0.5, rentLift: 0.05, note: 'They will love it. It will leak.' },
  { id: 'home_theatre', label: 'A home theatre', emoji: '🎬', cost: 2_200_000, valueShare: 0.7, rentLift: 0.07, note: 'A dark room with good chairs' },
  { id: 'infinity_pool', label: 'An infinity pool', emoji: '🏊', cost: 6_500_000, valueShare: 0.85, rentLift: 0.11, note: 'Costs a fortune to keep blue' },
  { id: 'panic_room', label: 'A panic room', emoji: '🚪', cost: 3_100_000, valueShare: 0.4, rentLift: 0.03, note: 'For a fear you have not named' },
  { id: 'solar', label: 'Solar panels', emoji: '☀️', cost: 1_400_000, valueShare: 0.9, rentLift: 0.06, note: 'Quietly takes money off the bills' },
];

/**
 * What a place lets for in a year: a share of what it is worth, adjusted for the
 * state of it and whatever has been put in.
 */
/**
 * What somebody would pay to live there for a year.
 *
 * A little over 5% of what the place is worth, which is only a sensible number
 * because upkeep on somewhere people live is around 2% of its value — the two
 * are set against each other on purpose. When residential upkeep sat at 4-10%
 * of price, a let flat lost money before a tenant had even missed a payment,
 * and owning where you lived cost more than renting it: the shop and the
 * whole landlord track were arithmetic traps.
 */
export const marketRent = (asset: Asset): number => {
  const lift = asset.amenityIds.reduce(
    (sum, id) => sum + (AMENITIES.find((a) => a.id === id)?.rentLift ?? 0),
    0,
  );
  const conditionFactor = 0.6 + (asset.condition / 100) * 0.55;
  return Math.round(asset.value * 0.052 * conditionFactor * (1 + lift));
};

/* ------------------------------------------------------------------ *
 * Finding somebody
 * ------------------------------------------------------------------ */

const FIRST = ['Dermot', 'Yvonne', 'Callum', 'Priya', 'Nadia', 'Errol', 'Sana', 'Gil', 'Roisin', 'Tomas', 'Bea', 'Kwame'];
const LAST = ['Prentice', 'Okoro', 'Vale', 'Sandhu', 'Bright', 'Muir', 'Kaplan', 'Ferreira', 'Oyelaran', 'Doyle'];

const NOTES: Record<Asset['rental'] extends null ? never : 'careful' | 'ordinary' | 'trouble', string[]> = {
  careful: [
    'Two references, both of whom answered.',
    'Has rented the same flat for nine years.',
    'Asked what the boiler was serviced with.',
  ],
  ordinary: [
    'Nothing on file either way.',
    'One landlord said "fine, mostly".',
    'Pays on time about four months in five.',
  ],
  trouble: [
    'Two previous evictions, both contested.',
    'A county court judgment they did not mention.',
    'The last landlord asked not to be quoted.',
  ],
};

/** What you can see for nothing, and what you are guessing at. */
export interface Applicant {
  name: string;
  emoji: string;
  age: number;
  job: string;
  offer: number;
  character: 'careful' | 'ordinary' | 'trouble';
  note: string;
}

const JOBS = ['Nurse', 'Delivery driver', 'Teacher', 'Chef', 'Student', 'Retired', 'Sound engineer', 'Carer', 'Between jobs'];

const applicantsFor = (asset: Asset, rng: Rng): Applicant[] => {
  const rent = marketRent(asset);
  // Three rows, three first names: a duplicate on a list this short reads as a
  // bug rather than a coincidence.
  const names = rng.shuffle(FIRST).slice(0, 3);
  return [0, 1, 2].map((i) => {
    const roll = rng.next();
    const character = roll < 0.3 ? 'careful' : roll < 0.78 ? 'ordinary' : 'trouble';
    /*
     * The awkward part of the decision: the one who will wreck the place often
     * offers the most, because they have to.
     */
    const premium = character === 'trouble' ? 1.12 : character === 'careful' ? 0.94 : 1;
    return {
      name: `${names[i]} ${rng.pick(LAST)}`,
      emoji: rng.chance(0.5) ? '🧑' : '👩',
      age: rng.int(21, 62),
      job: rng.pick(JOBS),
      offer: Math.round(rent * premium),
      character,
      note: rng.pick(NOTES[character]),
    };
  });
};

/** The cost of knowing. Cheap against a year of unpaid rent. */
export const CHECK_FEE = 12_000;

/**
 * Puts the three applicants on screen. The fact sheet and the meters are the
 * same widgets the love-interest card uses, because it is the same problem:
 * judging a stranger from what little you are shown.
 */
export const openApplicants = (
  state: LifeState,
  assetId: string,
  content: ContentPack,
  checked = false,
): boolean => {
  const definition = content.eventsById.get('rental_applicants');
  const asset = state.assets.find((a) => a.id === assetId);
  if (!definition || !asset) return false;

  /*
   * Seeded from the property and the year rather than from the caller, so
   * opening the list twice describes the same three people. Paying for
   * background checks and being handed a different set of applicants is the
   * opposite of what you paid for.
   */
  const people = applicantsFor(asset, makeRng(state.seed, 'applicants', assetId, state.character.age));

  state.flags.let_asset = assetId;
  state.flags.let_label = asset.label.toLowerCase();
  state.flags.let_checked = checked;
  state.flags.let_fee = formatMoneyExact(CHECK_FEE);
  people.forEach((p, i) => {
    const k = ['a', 'b', 'c'][i]!;
    state.flags[`let_${k}_name`] = p.name;
    state.flags[`let_${k}_age`] = p.age;
    state.flags[`let_${k}_job`] = p.job;
    state.flags[`let_${k}_offer`] = p.offer;
    state.flags[`let_${k}_price`] = `${money(p.offer)}/yr`;
    state.flags[`let_${k}_character`] = p.character;
    state.flags[`let_${k}_note`] = p.note;
    state.flags[`let_${k}_emoji`] = p.emoji;
  });
  state.flags.let_result = '';
  state.flags.let_result_title = '';

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);

  instance.facts = people.map((p) => ({
    label: `${p.name}, ${p.age}`,
    value: checked ? p.note : `${p.job} · offers ${money(p.offer)}`,
  }));
  instance.stake = { label: 'The going rate', value: `${money(marketRent(asset))}/yr` };

  // Only a check tells you what they are actually like.
  if (checked) {
    const bar: Record<Applicant['character'], number> = { careful: 88, ordinary: 55, trouble: 18 };
    instance.meters = people.map((p) => ({ label: p.name.split(' ')[0]!, value: bar[p.character] }));
  }

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  return true;
};

/** Signs the tenancy, or pays for the check and asks again. */
export const settleLetting = (
  state: LifeState,
  pick: 'a' | 'b' | 'c' | 'check' | 'none',
  content: ContentPack,
  rng: Rng,
): void => {
  const assetId = String(state.flags.let_asset ?? '');
  const asset = state.assets.find((a) => a.id === assetId);
  const label = String(state.flags.let_label ?? 'the place');
  if (!asset) return;

  if (pick === 'none') {
    state.flags.let_result_title = 'Left empty';
    state.flags.let_result = `You decided nobody was going to live in ${label} yet.`;
    state.flags.let_history = `You left ${label} empty rather than take a chance on anybody.`;
    clearLet(state);
    return;
  }

  if (pick === 'check') {
    const f = state.character.finances;
    if (CHECK_FEE > f.cash + f.savings) {
      state.flags.let_result_title = 'Cannot afford it';
      state.flags.let_result = 'You could not cover the fee, so you are choosing blind.';
      state.flags.let_history = `You could not afford to check who was moving into ${label}.`;
      clearLet(state);
      return;
    }
    const fromCash = Math.min(f.cash, CHECK_FEE);
    f.cash -= fromCash;
    f.savings -= CHECK_FEE - fromCash;
    /*
     * Re-opens the same list with the references read. The rng is advanced by
     * the step counter, so the three people are not silently reshuffled — you
     * paid to learn about these three.
     */
    /*
     * The list is rebuilt first, because building it clears the flags — writing
     * the result before that left the toast blank.
     */
    openApplicants(state, assetId, content, true);
    state.flags.let_result_title = 'References taken';
    state.flags.let_result = 'You paid for the checks and read them properly.';
    state.flags.let_history = `You paid ${money(CHECK_FEE)} to check who was moving into ${label}.`;
    return;
  }

  const name = String(state.flags[`let_${pick}_name`] ?? 'Somebody');
  const offer = Number(state.flags[`let_${pick}_offer`] ?? marketRent(asset));
  const character = String(state.flags[`let_${pick}_character`] ?? 'ordinary') as Applicant['character'];
  const deposit = Math.round(offer / 4);

  asset.rental = {
    tenantName: name,
    tenantEmoji: String(state.flags[`let_${pick}_emoji`] ?? '🧑'),
    rentAnnual: offer,
    deposit,
    sinceAge: state.character.age,
    satisfaction: 72,
    yearsUnpaid: 0,
    character,
    checked: state.flags.let_checked === true,
    note: String(state.flags[`let_${pick}_note`] ?? ''),
  };
  // You hold the deposit; it is theirs, and you give it back when they go.
  state.character.finances.cash += deposit;

  state.flags.let_result_title = 'Keys handed over';
  state.flags.let_result = `${name} moved into ${label} at ${money(offer)} a year. You are holding ${money(deposit)} of theirs.`;
  state.flags.let_history = `You let ${label} to ${name} for ${money(offer)} a year.`;
  void rng;
  clearLet(state);
};

const clearLet = (state: LifeState): void => {
  for (const key of Object.keys(state.flags)) {
    if (key.startsWith('let_') && !key.startsWith('let_result') && key !== 'let_history') {
      delete state.flags[key];
    }
  }
};

/* ------------------------------------------------------------------ *
 * The year
 * ------------------------------------------------------------------ */

/** How fast a place falls apart. Somebody living in it wears it faster. */
const DECAY = { empty: 1.4, careful: 1.8, ordinary: 3.2, trouble: 6.5 } as const;

/**
 * One year of every property you own.
 *
 * Rent arrives or it does not, the place wears, and the tenant either settles
 * in or starts looking. Everything here writes a line when it matters, because
 * money arriving unexplained is the complaint this whole rebuild started from.
 */
export const advanceProperties = (state: LifeState, rng: Rng): void => {
  for (const asset of state.assets) {
    if (!isLettable(asset)) continue;
    const let_ = asset.rental;

    asset.condition = Math.max(
      0,
      Math.round(asset.condition - (let_ ? DECAY[let_.character] : DECAY.empty)),
    );
    if (!let_) continue;

    /*
     * Whether they pay. A careful tenant almost always does; one you should
     * have checked often does not, and that is the cost of not checking.
     */
    const paysChance = { careful: 0.98, ordinary: 0.9, trouble: 0.62 }[let_.character];
    if (rng.chance(paysChance)) {
      state.character.finances.cash += let_.rentAnnual;
      if (let_.yearsUnpaid > 0) {
        let_.yearsUnpaid = 0;
        say(state, '🏠', `${let_.tenantName} caught up on the rent.`, 35);
      }
    } else {
      let_.yearsUnpaid += 1;
      say(
        state,
        '📭',
        let_.yearsUnpaid === 1
          ? `${let_.tenantName} did not pay the rent on ${asset.label.toLowerCase()} this year.`
          : `${let_.tenantName} is ${let_.yearsUnpaid} years behind on the rent.`,
        45,
      );
    }

    /*
     * How they feel about living there, pulled toward what the place is
     * actually like. A tenant in a wreck leaves; a tenant in a good place with
     * a landlord who fixes things stays for a decade.
     */
    const target = 25 + Math.round(asset.condition * 0.7);
    let_.satisfaction = Math.max(
      0,
      Math.min(100, Math.round(let_.satisfaction + (target - let_.satisfaction) * 0.45)),
    );

    // Something they did to the place.
    if (let_.character === 'trouble' && rng.chance(0.3)) {
      asset.condition = Math.max(0, asset.condition - rng.int(6, 18));
      say(state, '🔨', `Something got broken at ${asset.label.toLowerCase()} and nobody mentioned it.`, 30);
    }

    if (let_.satisfaction < 22 && rng.chance(0.55)) {
      const owed = let_.yearsUnpaid * let_.rentAnnual;
      // They go, and you owe them their deposit back less whatever they owe you.
      const returned = Math.max(0, let_.deposit - owed);
      state.character.finances.cash -= returned;
      say(
        state,
        '📦',
        `${let_.tenantName} moved out of ${asset.label.toLowerCase()}.`,
        35,
      );
      asset.rental = null;
    }
  }
};

const say = (state: LifeState, icon: string, line: string, weight: number): void =>
  pushHistory(state, 'money', icon, line, weight);

/* ------------------------------------------------------------------ *
 * Managing it
 * ------------------------------------------------------------------ */

export interface PropertyRow {
  assetId: string;
  label: string;
  emoji: string;
  value: string;
  condition: number;
  conditionWord: string;
  /** Null when nobody is in it. */
  tenant: {
    name: string;
    emoji: string;
    rent: string;
    satisfaction: number;
    satisfactionWord: string;
    since: string;
    arrears: string | null;
    note: string;
  } | null;
  marketRent: string;
  amenities: string[];
  /** What can be done to it right now, and why not. */
  actions: Array<{ id: string; label: string; note: string; price: string; available: boolean }>;
}

const word = (n: number, good: string, ok: string, bad: string): string =>
  n >= 70 ? good : n >= 40 ? ok : bad;

/** What a year of putting it right costs, against how bad it has got. */
export const maintenanceCost = (asset: Asset): number =>
  Math.max(40_000, Math.round(asset.value * 0.012 * ((100 - asset.condition) / 45)));

export const propertiesView = (state: LifeState): PropertyRow[] =>
  state.assets.filter(isLettable).map((asset) => {
    const liquid = state.character.finances.cash + state.character.finances.savings;
    const repair = maintenanceCost(asset);
    const let_ = asset.rental;
    const years = let_ ? state.character.age - let_.sinceAge : 0;

    return {
      assetId: asset.id,
      label: asset.label,
      emoji: asset.emoji,
      value: money(asset.value),
      condition: asset.condition,
      conditionWord: word(asset.condition, 'Good order', 'Getting tired', 'Falling apart'),
      tenant: let_
        ? {
            name: let_.tenantName,
            emoji: let_.tenantEmoji,
            rent: `${money(let_.rentAnnual)}/yr`,
            satisfaction: let_.satisfaction,
            satisfactionWord: word(let_.satisfaction, 'Settled', 'Getting restless', 'Wants out'),
            since: years === 0 ? 'Moved in this year' : `${years} ${years === 1 ? 'year' : 'years'} in`,
            arrears:
              let_.yearsUnpaid > 0
                ? `${money(let_.yearsUnpaid * let_.rentAnnual)} behind`
                : null,
            note: let_.checked ? let_.note : 'You never checked.',
          }
        : null,
      marketRent: `${money(marketRent(asset))}/yr`,
      amenities: asset.amenityIds
        .map((id) => AMENITIES.find((a) => a.id === id)?.label ?? id)
        .filter(Boolean),
      actions: [
        {
          id: 'let',
          label: let_ ? 'Already let' : 'Let it out',
          note: let_ ? `${let_.tenantName} lives here` : `About ${money(marketRent(asset))} a year`,
          price: '',
          available: !let_ && !state.activeEvent && state.character.alive,
        },
        {
          id: 'inspect',
          label: 'Drop in',
          note: let_ ? 'See what they have done to it' : 'Nobody to drop in on',
          price: '',
          available: !!let_ && !state.activeEvent && state.character.alive,
        },
        {
          id: 'maintain',
          label: 'Put it right',
          note: asset.condition >= 92 ? 'Nothing needs doing' : 'Repairs and a decorator',
          price: money(repair),
          available:
            asset.condition < 92 && repair <= liquid && !state.activeEvent && state.character.alive,
        },
        {
          id: 'raise_rent',
          label: 'Raise the rent',
          note: let_ ? 'They will like it less' : 'Nobody is paying it',
          price: '',
          available: !!let_ && !state.activeEvent && state.character.alive,
        },
        {
          id: 'evict',
          label: 'Evict them',
          note: let_
            ? let_.yearsUnpaid > 0
              ? 'They owe you, so you keep the deposit'
              : `You give back ${money(let_.deposit)}`
            : 'Nobody to evict',
          price: '',
          available: !!let_ && !state.activeEvent && state.character.alive,
        },
      ],
    };
  });

/**
 * Does the thing. Everything is a transaction: if applying it would break an
 * invariant, nothing is kept.
 */
export const manageProperty = (
  state: LifeState,
  assetId: string,
  action: string,
  content: ContentPack,
  config: GameConfig,
  amenityId?: string,
): LifeState => {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset || !isLettable(asset)) throw new LandlordRejected('you do not own that');
  if (!state.character.alive) throw new LandlordRejected('a dead character owns nothing');
  if (state.activeEvent) throw new LandlordRejected('answer the open decision first');

  const before = structuredClone(state);
  const rng = makeRng(state.seed, 'landlord', assetId, action, state.character.age, state.step);
  const f = state.character.finances;

  try {
    switch (action) {
      case 'let': {
        if (asset.rental) throw new LandlordRejected('somebody already lives there');
        openApplicants(state, assetId, content);
        break;
      }

      case 'inspect': {
        const let_ = asset.rental;
        if (!let_) throw new LandlordRejected('there is nobody to drop in on');
        /*
         * Turning up unannounced tells you what state the place is in and costs
         * you a little of the goodwill that keeps them there. Both are true of
         * doing it in life.
         */
        let_.satisfaction = Math.max(0, let_.satisfaction - 6);
        const verdict =
          asset.condition >= 75
            ? 'It is in better shape than you expected.'
            : asset.condition >= 45
              ? 'It is tired. Nothing you would call damage.'
              : 'It is in a state, and they did not apologise.';
        pushHistory(state, 'money', '🔍', `You dropped in on ${let_.tenantName}. ${verdict}`, 20);
        break;
      }

      case 'maintain': {
        const cost = maintenanceCost(asset);
        if (cost > f.cash + f.savings) throw new LandlordRejected('you cannot afford that');
        const fromCash = Math.min(f.cash, cost);
        f.cash -= fromCash;
        f.savings -= cost - fromCash;
        asset.condition = Math.min(100, asset.condition + rng.int(18, 32));
        if (asset.rental) asset.rental.satisfaction = Math.min(100, asset.rental.satisfaction + 12);
        pushHistory(
          state,
          'money',
          '🔧',
          `You spent ${money(cost)} putting ${asset.label.toLowerCase()} right.`,
          25,
        );
        break;
      }

      case 'amenity': {
        const amenity = AMENITIES.find((a) => a.id === amenityId);
        if (!amenity) throw new LandlordRejected('there is no such thing to add');
        if (asset.amenityIds.includes(amenity.id)) throw new LandlordRejected('it already has one');
        if (amenity.cost > f.cash + f.savings) throw new LandlordRejected('you cannot afford that');

        const fromCash = Math.min(f.cash, amenity.cost);
        f.cash -= fromCash;
        f.savings -= amenity.cost - fromCash;
        asset.amenityIds.push(amenity.id);
        /*
         * You almost never get back what you spent — which is the honest thing
         * about improving a house, and the reason the rent lift matters more
         * than the valuation does.
         */
        asset.value += Math.round(amenity.cost * amenity.valueShare);
        asset.annualCost += Math.round(amenity.cost * 0.02);
        if (asset.rental) asset.rental.satisfaction = Math.min(100, asset.rental.satisfaction + 9);
        pushHistory(
          state,
          'money',
          amenity.emoji,
          `You put ${amenity.label.toLowerCase()} into ${asset.label.toLowerCase()}.`,
          30,
        );
        break;
      }

      case 'raise_rent': {
        const let_ = asset.rental;
        if (!let_) throw new LandlordRejected('nobody is paying it');
        const target = marketRent(asset);
        // You can ask for the going rate plus a bit. Asking for a lot more is
        // how a tenancy ends.
        const asked = Math.max(let_.rentAnnual + 1, Math.round(Math.max(target, let_.rentAnnual) * 1.08));
        const jump = (asked - let_.rentAnnual) / Math.max(1, let_.rentAnnual);
        let_.rentAnnual = asked;
        let_.satisfaction = Math.max(0, let_.satisfaction - Math.round(14 + jump * 90));
        pushHistory(
          state,
          'money',
          '📈',
          `You put the rent on ${asset.label.toLowerCase()} up to ${money(asked)} a year.`,
          25,
        );
        break;
      }

      case 'evict': {
        const let_ = asset.rental;
        if (!let_) throw new LandlordRejected('there is nobody to evict');
        const owed = let_.yearsUnpaid * let_.rentAnnual;
        // You hold their deposit against what they owe, and hand back the rest.
        const returned = Math.max(0, let_.deposit - owed);
        f.cash -= returned;
        asset.rental = null;
        pushHistory(
          state,
          'money',
          '🚪',
          owed > 0
            ? `You evicted ${let_.tenantName}, who owed you ${money(owed)}, and kept the deposit.`
            : `You evicted ${let_.tenantName} and gave back the ${money(returned)} deposit.`,
          40,
        );
        break;
      }

      default:
        throw new LandlordRejected('there is no such thing to do');
    }

    state.step += 1;
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** What the amenity list looks like for one property. */
export const amenitiesFor = (
  state: LifeState,
  assetId: string,
): Array<{ id: string; label: string; emoji: string; note: string; price: string; available: boolean; owned: boolean }> => {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) return [];
  const liquid = state.character.finances.cash + state.character.finances.savings;
  return AMENITIES.map((a) => ({
    id: a.id,
    label: a.label,
    emoji: a.emoji,
    note: asset.amenityIds.includes(a.id) ? 'Already in' : a.note,
    price: money(a.cost),
    owned: asset.amenityIds.includes(a.id),
    available:
      !asset.amenityIds.includes(a.id) &&
      a.cost <= liquid &&
      !state.activeEvent &&
      state.character.alive,
  }));
};
