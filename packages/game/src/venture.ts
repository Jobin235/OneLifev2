import type { GameConfig } from '@lineage/config';
import type { ContentPack, VenturePack } from '@lineage/content';
import {
  clampStat,
  type LifeState,
  type Venture,
  type VentureKind,
  type VentureMember,
} from '@lineage/shared-types';
import {
  checkInvariants,
  makeId,
  makeRng,
  pushHistory,
  refreshDerived,
  type Rng,
} from '@lineage/simulation';
import { openCharges } from './justice.js';

/**
 * Things you own and run.
 *
 * Three of BitLife's packs — the cult, the zoo and the spy agency — are one
 * machine wearing three sets of nouns: premises with a capacity, things you
 * acquire one at a time, a meter that decays every year, and a payout against
 * an upkeep. Writing that three times would have produced three subtly
 * different versions of the same bugs, so it is written once and the nouns,
 * the numbers and the bespoke actions live in `content/ventures.json`.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class VentureRejected extends Error {}

/** Actions a year. The ceiling on how fast one of these can be played out. */
const ACTIONS_A_YEAR = 3;

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

const packFor = (content: ContentPack, kind: VentureKind): VenturePack => {
  const pack = content.venturesById.get(kind);
  if (!pack) throw new VentureRejected(`there is no such thing as a ${kind}`);
  return pack;
};

const liquid = (state: LifeState) =>
  state.character.finances.cash + state.character.finances.savings;

/* ------------------------------------------------------------------ *
 * Starting one
 * ------------------------------------------------------------------ */

/**
 * Buys the premises.
 *
 * The tier is the whole of the early decision: a bigger place holds more, and
 * a better place is what makes the better sort of thing turn up at all. BitLife
 * sells zoos in three sizes for the same reason.
 */
export const startVenture = (
  state: LifeState,
  kind: VentureKind,
  tierId: string,
  content: ContentPack,
  config: GameConfig,
): LifeState => {
  if (!state.character.alive) throw new VentureRejected('a dead character cannot run anything');
  if (state.activeEvent) throw new VentureRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new VentureRejected('not from in here');
  if (state.character.age < 18) throw new VentureRejected('you are too young for that');
  if (state.ventures.some((v) => v.kind === kind)) {
    throw new VentureRejected('you already have one of those');
  }

  const pack = packFor(content, kind);
  const tier = pack.tiers.find((t) => t.id === tierId);
  if (!tier) throw new VentureRejected('there is no such place');
  if (tier.price > liquid(state)) throw new VentureRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'venture', kind, state.character.age);
    state.step += 1;
    spend(state, tier.price);

    const venture: Venture = {
      id: makeId('ven', state.seed, kind, state.character.age),
      kind,
      name: rng.pick(pack.names),
      tierId: tier.id,
      capacity: tier.capacity,
      appeal: tier.appeal,
      /*
       * Not full, and not empty. A new thing is given the benefit of the doubt
       * by whoever turned up for it, and has to keep it — which is the loop.
       */
      morale: 62,
      members: [],
      upgradeIds: [],
      foundedAtAge: state.character.age,
      actionsThisYear: 0,
      lastYear: 0,
    };
    state.ventures.push(venture);

    pushHistory(
      state,
      'money',
      pack.emoji,
      `You bought ${tier.label.toLowerCase()} and called it ${venture.name}.`,
      70,
    );
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** Draws cash first, then savings — the same order the shop uses. */
const spend = (state: LifeState, cents: number): void => {
  const f = state.character.finances;
  const fromCash = Math.min(f.cash, cents);
  f.cash -= fromCash;
  f.savings -= cents - fromCash;
};

/* ------------------------------------------------------------------ *
 * Filling it
 * ------------------------------------------------------------------ */

const FIRST = [
  'Marisol', 'Teodor', 'Anneke', 'Rasheed', 'Ingrid', 'Kwame', 'Sunniva', 'Dara',
  'Emeka', 'Petra', 'Nils', 'Rosalind', 'Iker', 'Yuki', 'Femi', 'Clarissa',
];
const LAST = [
  'Okafor', 'Lindqvist', 'Basara', 'Moreau', 'Achebe', 'Halloran', 'Novak', 'Ferreira',
  'Bergström', 'Adeyemi', 'Kovač', 'Duarte', 'Ravn', 'Mbeki', 'Solberg', 'Renard',
];

/**
 * Something arrives.
 *
 * What can arrive is gated on how good the place is: nothing rare turns up at
 * a field with a barn on it, and the way to change that is to build. That is
 * the one rule that makes upgrades worth buying rather than a second currency
 * sink.
 */
const arrival = (
  venture: Venture,
  pack: VenturePack,
  rng: Rng,
  age: number,
  minQuality = 0,
): VentureMember | null => {
  const eligible = pack.memberTypes.filter((t) => t.minAppeal <= venture.appeal);
  if (eligible.length === 0) return null;

  const total = eligible.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng.next() * total;
  const type = eligible.find((t) => (roll -= t.weight) <= 0) ?? eligible[0]!;

  const quality = Math.max(minQuality, rng.int(type.quality[0], type.quality[1]));
  return {
    id: makeId('vm', venture.id, String(venture.members.length), String(age)),
    typeId: type.id,
    label:
      pack.kind === 'zoo'
        ? type.label
        : `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    emoji: type.emoji,
    quality: clampStat(quality),
    sinceAge: age,
  };
};

/* ------------------------------------------------------------------ *
 * Running it
 * ------------------------------------------------------------------ */

export interface VentureActResult {
  state: LifeState;
  line: string;
  /** What it paid out on the spot, formatted, or null. */
  paid: string | null;
}

/**
 * Do one of the things this kind of venture does.
 *
 * Every action is the same three moves — spend money, move the meter, maybe
 * bring somebody in — and the differences between a ceremony, a vet round and
 * a mission are entirely numbers in the content pack. The exceptions are the
 * two flags: `pays` settles immediately out of what the members are worth, and
 * `takes` trades the meter for a lump sum and some of the members with it.
 */
export const ventureAct = (
  state: LifeState,
  ventureId: string,
  actionId: string,
  content: ContentPack,
  config: GameConfig,
): VentureActResult => {
  const venture = state.ventures.find((v) => v.id === ventureId);
  if (!venture) throw new VentureRejected('you do not have one of those');
  if (!state.character.alive) throw new VentureRejected('a dead character cannot run anything');
  if (state.activeEvent) throw new VentureRejected('answer the open decision first');

  const pack = packFor(content, venture.kind);
  const action = pack.actions.find((a) => a.id === actionId);
  if (!action) throw new VentureRejected('there is no such thing to do');

  const lock = ventureLock(state, venture, action.id, content);
  if (lock) throw new VentureRejected(lock.toLowerCase());

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'ventureact', venture.id, actionId, state.character.age, venture.actionsThisYear);
    state.step += 1;
    venture.actionsThisYear += 1;
    if (action.price > 0) spend(state, action.price);

    /*
     * The ones that can go wrong go wrong through the ordinary justice flow,
     * for the same reason a mob arrest does: there is no reason burning a
     * rival's servers should get its own bespoke punishment.
     */
    if (action.risk > 0 && rng.chance(action.risk * (1 - state.character.stats.smarts / 200))) {
      venture.morale = clampStat(venture.morale - 12);
      openCharges(
        state,
        {
          offence: venture.kind === 'agency' ? 'Computer misuse' : 'Fraud',
          sentenceYears: 4,
          fine: 0,
          facility: 'the county jail',
        },
        content,
        rng,
      );
      const line = 'It went wrong, and somebody had your name.';
      refreshDerived(state, config);
      checkInvariants(state, before);
      return { state, line, paid: null };
    }

    venture.morale = clampStat(venture.morale + action.morale);

    let paid = 0;
    if (action.pays) {
      /*
       * What a job pays is what the people on it are worth. An agency of
       * runners earns runner money however grand the building is.
       */
      const strength = venture.members.reduce((sum, m) => sum + yieldOf(m, pack), 0);
      paid = Math.round(strength * (0.12 + rng.next() * 0.22));
      state.character.finances.cash += paid;
    }

    if (action.takes) {
      /*
       * The one that is worth doing once. You take what they have and some of
       * them go home, which is the honest shape of it.
       */
      paid = Math.round(
        venture.members.reduce((sum, m) => sum + yieldOf(m, pack), 0) * (1.4 + rng.next()),
      );
      state.character.finances.cash += paid;
      const leaving = Math.round(venture.members.length * (0.15 + rng.next() * 0.2));
      venture.members = venture.members.slice(leaving);
    }

    const wanted = rng.int(action.recruits[0], action.recruits[1]);
    let came = 0;
    for (let i = 0; i < wanted; i++) {
      if (venture.members.length >= venture.capacity) break;
      const member = arrival(venture, pack, rng, state.character.age, action.minQuality);
      if (!member) break;
      venture.members.push(member);
      came += 1;
    }

    const line = lineFor(pack, action.id, came, paid, venture);
    pushHistory(state, 'money', action.emoji, line, 25);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, line, paid: paid > 0 ? money(paid) : null };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** What one member is worth a year, scaled by how good they are. */
const yieldOf = (member: VentureMember, pack: VenturePack): number => {
  const type = pack.memberTypes.find((t) => t.id === member.typeId);
  if (!type) return 0;
  return Math.round(type.yield * (0.4 + member.quality / 140));
};

const lineFor = (
  pack: VenturePack,
  actionId: string,
  came: number,
  paid: number,
  venture: Venture,
): string => {
  const noun = came === 1 ? pack.memberWord : pack.memberWordPlural;
  const arrived = came > 0 ? ` ${came} new ${noun}.` : '';
  const took = paid > 0 ? ` ${money(paid)}.` : '';

  const bespoke: Record<string, string> = {
    outreach: 'You went out and talked to people who would listen.',
    ceremony: `${venture.name} sat up all night and nobody wanted it to end.`,
    teach: 'You taught every evening for a year and they came every evening.',
    tithe: 'You asked them for everything they had. Some of them gave it, and some of them left.',
    acquire: 'You drove to the trading post and came back with the van fuller than it went.',
    enrich: 'The enclosure came down and a better one went up.',
    vet_round: 'Everything got looked at properly, some of it for the first time.',
    breed: 'The programme did what it was for, slowly.',
    interview: 'You saw eleven people and one of them could do it.',
    poach: 'They cost a great deal and were worth it.',
    mission: 'It went the way these things go when they go well: quietly.',
    burn: 'Somebody else is having a very bad morning.',
  };
  return `${bespoke[actionId] ?? 'It was done.'}${arrived}${took}`;
};

/** Why an action is not available, or null when it is. */
export const ventureLock = (
  state: LifeState,
  venture: Venture,
  actionId: string,
  content: ContentPack,
): string | null => {
  const pack = content.venturesById.get(venture.kind);
  const action = pack?.actions.find((a) => a.id === actionId);
  if (!pack || !action) return 'There is no such thing to do';
  if (state.character.record.incarceration) return 'Not from in here';
  if (venture.actionsThisYear >= ACTIONS_A_YEAR) return 'You have done enough this year';
  if (action.price > liquid(state)) return `You cannot afford that (${money(action.price)})`;
  if ((action.pays || action.takes) && venture.members.length === 0) {
    return `You have no ${pack.memberWordPlural}`;
  }
  /*
   * Only the actions whose whole point is bringing somebody in. A ceremony
   * that might also attract one is still worth holding when the place is full,
   * and locking it read as the screen being broken.
   */
  if (action.recruits[0] > 0 && venture.members.length >= venture.capacity) {
    return 'There is no room for anybody else';
  }
  return null;
};

/** Builds something. Appeal only ever goes up, and it is what buys the rest. */
export const ventureUpgrade = (
  state: LifeState,
  ventureId: string,
  upgradeId: string,
  content: ContentPack,
  config: GameConfig,
): LifeState => {
  const venture = state.ventures.find((v) => v.id === ventureId);
  if (!venture) throw new VentureRejected('you do not have one of those');
  if (state.activeEvent) throw new VentureRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new VentureRejected('not from in here');

  const pack = packFor(content, venture.kind);
  const upgrade = pack.upgrades.find((u) => u.id === upgradeId);
  if (!upgrade) throw new VentureRejected('there is no such thing to build');
  if (venture.upgradeIds.includes(upgradeId)) throw new VentureRejected('you already have that');
  if (upgrade.price > liquid(state)) throw new VentureRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    state.step += 1;
    spend(state, upgrade.price);
    venture.upgradeIds.push(upgradeId);
    venture.appeal = clampStat(venture.appeal + upgrade.appeal);
    venture.morale = clampStat(venture.morale + 4);
    pushHistory(state, 'money', upgrade.emoji, `${venture.name} got ${upgrade.label.toLowerCase()}.`, 25);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The year
 * ------------------------------------------------------------------ */

/**
 * What a year of owning one does.
 *
 * The meter falls whatever you do, which is what makes it a thing you tend
 * rather than a thing you set. At the floor, members start leaving — slowly,
 * so a bad year is a warning rather than a wipe.
 */
export const advanceVentureYear = (
  state: LifeState,
  content: ContentPack,
  rng: Rng,
): void => {
  for (const venture of state.ventures) {
    const pack = content.venturesById.get(venture.kind);
    if (!pack) continue;
    venture.actionsThisYear = 0;

    /*
     * A good place holds people better than a bad one. This is where appeal
     * pays for itself over a lifetime rather than in the year it was bought.
     */
    const drift = 9 - Math.round(venture.appeal / 14);
    venture.morale = clampStat(venture.morale - Math.max(2, drift));

    if (venture.morale < 25 && venture.members.length > 0) {
      const leaving = Math.max(1, Math.round(venture.members.length * (0.1 + rng.next() * 0.15)));
      venture.members = venture.members.slice(leaving);
      pushHistory(
        state,
        'money',
        '🚪',
        `${leaving} ${leaving === 1 ? pack.memberWord : pack.memberWordPlural} left ${venture.name}.`,
        35,
      );
    }

    const gross = venture.members.reduce((sum, m) => sum + yieldOf(m, pack), 0);
    /*
     * Takings scale with how content the place is, because a miserable zoo is a
     * zoo nobody visits twice. Upkeep does not: the animals eat either way.
     */
    const takings = Math.round(gross * (0.4 + venture.morale / 140));
    const upkeep = venture.members.length * pack.upkeepPerMember;
    const net = takings - upkeep;
    venture.lastYear = net;

    if (net >= 0) state.character.finances.cash += net;
    else spend(state, -net);

    if (venture.members.length > 0) {
      pushHistory(
        state,
        'money',
        pack.emoji,
        net >= 0
          ? `${venture.name} cleared ${money(net)} this year.`
          : `${venture.name} cost you ${money(-net)} this year.`,
        net >= 0 ? 20 : 40,
      );
    }
  }
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

const word = (n: number): string => {
  if (n >= 80) return 'Thriving';
  if (n >= 60) return 'Content';
  if (n >= 40) return 'Getting by';
  if (n >= 25) return 'Unhappy';
  return 'Leaving';
};

export interface VentureView {
  id: string;
  kind: VentureKind;
  name: string;
  emoji: string;
  /** "Twelve acres and a barn". */
  premises: string;
  memberWord: string;
  memberWordPlural: string;
  moraleWord: string;
  appealWord: string;
  morale: number;
  moraleLabel: string;
  appeal: number;
  members: Array<{ id: string; label: string; emoji: string; quality: number }>;
  capacity: number;
  /** "$41,200 last year", or the loss. */
  lastYear: string;
  actionsLeft: number;
  actions: Array<{
    id: string;
    emoji: string;
    label: string;
    note: string;
    price: string;
    available: boolean;
    locked: string | null;
  }>;
  upgrades: Array<{
    id: string;
    emoji: string;
    label: string;
    price: string;
    owned: boolean;
    affordable: boolean;
  }>;
}

export const venturesView = (state: LifeState, content: ContentPack): VentureView[] =>
  state.ventures.flatMap((venture) => {
    const pack = content.venturesById.get(venture.kind);
    if (!pack) return [];
    const tier = pack.tiers.find((t) => t.id === venture.tierId);

    return [
      {
        id: venture.id,
        kind: venture.kind,
        name: venture.name,
        emoji: pack.emoji,
        premises: tier?.label ?? '',
        memberWord: pack.memberWord,
        memberWordPlural: pack.memberWordPlural,
        moraleWord: pack.moraleWord,
        appealWord: pack.appealWord,
        morale: venture.morale,
        moraleLabel: word(venture.morale),
        appeal: venture.appeal,
        members: venture.members.map((m) => ({
          id: m.id,
          label: m.label,
          emoji: m.emoji,
          quality: m.quality,
        })),
        capacity: venture.capacity,
        lastYear:
          venture.lastYear === 0
            ? 'Nothing yet'
            : venture.lastYear > 0
              ? `${money(venture.lastYear)} last year`
              : `${money(-venture.lastYear)} lost last year`,
        actionsLeft: Math.max(0, ACTIONS_A_YEAR - venture.actionsThisYear),
        actions: pack.actions.map((a) => {
          const locked = ventureLock(state, venture, a.id, content);
          return {
            id: a.id,
            emoji: a.emoji,
            label: a.label,
            note: a.note,
            price: a.price > 0 ? money(a.price) : '',
            available: locked === null,
            locked,
          };
        }),
        upgrades: pack.upgrades.map((u) => ({
          id: u.id,
          emoji: u.emoji,
          label: u.label,
          price: money(u.price),
          owned: venture.upgradeIds.includes(u.id),
          affordable: u.price <= liquid(state),
        })),
      },
    ];
  });

/** What could be started, and what the premises cost. */
export interface VentureOffer {
  kind: VentureKind;
  label: string;
  emoji: string;
  buyLabel: string;
  owned: boolean;
  tiers: Array<{ id: string; label: string; price: string; capacity: number; affordable: boolean }>;
}

export const ventureOffers = (state: LifeState, content: ContentPack): VentureOffer[] =>
  content.ventures.map((pack) => ({
    kind: pack.kind,
    label: pack.label,
    emoji: pack.emoji,
    buyLabel: pack.buyLabel,
    owned: state.ventures.some((v) => v.kind === pack.kind),
    tiers: pack.tiers.map((t) => ({
      id: t.id,
      label: t.label,
      price: money(t.price),
      capacity: t.capacity,
      affordable: t.price <= liquid(state),
    })),
  }));
