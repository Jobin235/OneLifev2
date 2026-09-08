import type { GameConfig } from '@lineage/config';
import { clampStat, type LifeState } from '@lineage/shared-types';
import { checkInvariants, makeId, makeRng, pushHistory, refreshDerived } from '@lineage/simulation';

/**
 * Racing.
 *
 * BitLife's pack is a garage, cars you modify, and three classes you climb by
 * winning. The races themselves are a throttle slider, which does not survive
 * being turned into one tap, so what survives is the decision underneath it:
 * how hard to push, against a car that can only take so much.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

export class RacingRejected extends Error {}

const RACES_A_YEAR = 4;
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export const RACE_CLASSES = ['bronze', 'silver', 'gold'] as const;
export type RaceClass = (typeof RACE_CLASSES)[number];

/** Points to move up, and what the class pays. */
/*
 * Fields pitched against what the cars actually produce: a hot hatch is
 * competitive in bronze and nowhere else, a GT belongs in silver, and gold
 * wants a prototype and a driver. The first pass put bronze at 58 against a
 * modded coupe worth 84, and a quarter of the field won two races in three.
 */
const CLASS_BAR: Record<RaceClass, { points: number; purse: number; field: number }> = {
  bronze: { points: 40, purse: 120_000_00, field: 66 },
  silver: { points: 120, purse: 900_000_00, field: 82 },
  gold: { points: 999, purse: 6_000_000_00, field: 97 },
};

export const CARS = [
  { id: 'hatch', label: 'A hot hatch somebody welded', emoji: '🚗', price: 90_000_00, speed: 42, grip: 55, tough: 62 },
  { id: 'coupe', label: 'A rear-drive coupe', emoji: '🚙', price: 320_000_00, speed: 58, grip: 60, tough: 58 },
  { id: 'gt', label: 'A GT car with a history', emoji: '🏎️', price: 1_400_000_00, speed: 74, grip: 72, tough: 66 },
  { id: 'proto', label: 'A prototype nobody should sell you', emoji: '🛸', price: 6_500_000_00, speed: 92, grip: 84, tough: 54 },
];

export const MODS = [
  { id: 'engine', label: 'Open the engine up', emoji: '🔧', price: 60_000_00, speed: 9, grip: 0, tough: -4 },
  { id: 'aero', label: 'Aero, properly done', emoji: '🪽', price: 90_000_00, speed: 3, grip: 11, tough: 0 },
  { id: 'cage', label: 'A roll cage and better brakes', emoji: '🛡️', price: 45_000_00, speed: -2, grip: 4, tough: 14 },
  { id: 'tyres', label: 'Tyres that cost more than the car', emoji: '⚫', price: 30_000_00, speed: 2, grip: 9, tough: -2 },
];

/* ------------------------------------------------------------------ *
 * The garage
 * ------------------------------------------------------------------ */

const GARAGE_PRICE = 180_000_00;

const spend = (state: LifeState, cents: number): void => {
  const f = state.character.finances;
  const fromCash = Math.min(f.cash, cents);
  f.cash -= fromCash;
  f.savings -= cents - fromCash;
};

const purse = (state: LifeState) =>
  state.character.finances.cash + state.character.finances.savings;

export const buyGarage = (state: LifeState, config: GameConfig): LifeState => {
  if (state.flags.garage) throw new RacingRejected('you already have one');
  const lock = racingLock(state);
  if (lock) throw new RacingRejected(lock.toLowerCase());
  if (GARAGE_PRICE > purse(state)) throw new RacingRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    state.step += 1;
    spend(state, GARAGE_PRICE);
    state.flags.garage = true;
    state.flags.race_class = 'bronze';
    state.flags.race_points = 0;
    pushHistory(state, 'money', '🏁', 'You took the lease on a unit with a roller door.', 40);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/** Buys a car into the garage. Cars are assets, so they show up under Assets too. */
export const buyRaceCar = (state: LifeState, carId: string, config: GameConfig): LifeState => {
  const car = CARS.find((c) => c.id === carId);
  if (!car) throw new RacingRejected('nobody sells that');
  if (!state.flags.garage) throw new RacingRejected('you have nowhere to put it');
  const lock = racingLock(state);
  if (lock) throw new RacingRejected(lock.toLowerCase());
  if (car.price > purse(state)) throw new RacingRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    state.step += 1;
    spend(state, car.price);
    const id = makeId('car', state.seed, carId, state.character.age);
    state.assets.push({
      id,
      kind: 'car',
      label: car.label,
      emoji: car.emoji,
      value: Math.round(car.price * 0.85),
      acquiredAtAge: state.character.age,
      annualCost: Math.round(car.price * 0.04),
      loanOutstanding: 0,
      meaning: null,
      condition: 100,
      amenityIds: [],
      rental: null,
    });
    state.flags[`race_car_${id}`] = `${car.speed}:${car.grip}:${car.tough}`;
    pushHistory(state, 'money', car.emoji, `You bought ${car.label.toLowerCase()}.`, 30);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

const statsOf = (state: LifeState, assetId: string) => {
  const raw = String(state.flags[`race_car_${assetId}`] ?? '');
  const [speed, grip, tough] = raw.split(':').map(Number);
  if (speed === undefined || grip === undefined || tough === undefined) return null;
  return { speed, grip, tough };
};

export const modifyCar = (
  state: LifeState,
  assetId: string,
  modId: string,
  config: GameConfig,
): LifeState => {
  const mod = MODS.find((m) => m.id === modId);
  const stats = statsOf(state, assetId);
  if (!mod || !stats) throw new RacingRejected('there is nothing to do to that');
  const lock = racingLock(state);
  if (lock) throw new RacingRejected(lock.toLowerCase());
  if (state.flags[`race_mod_${assetId}_${modId}`]) throw new RacingRejected('it already has that');
  if (mod.price > purse(state)) throw new RacingRejected('you cannot afford that');

  const before = structuredClone(state);
  try {
    state.step += 1;
    spend(state, mod.price);
    state.flags[`race_mod_${assetId}_${modId}`] = true;
    state.flags[`race_car_${assetId}`] = [
      clampStat(stats.speed + mod.speed),
      clampStat(stats.grip + mod.grip),
      clampStat(stats.tough + mod.tough),
    ].join(':');
    pushHistory(state, 'money', mod.emoji, `${mod.label}. It is not the same car.`, 15);
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The race
 * ------------------------------------------------------------------ */

export const RACE_STYLES = ['conserve', 'steady', 'push'] as const;
export type RaceStyle = (typeof RACE_STYLES)[number];

export interface RaceResult {
  state: LifeState;
  place: number;
  line: string;
  prize: string | null;
  broke: boolean;
}

/**
 * One race.
 *
 * Everything about the car matters and so does how hard you lean on it: pushing
 * adds pace and takes it out of the car, which is the only decision the slider
 * was ever making. A car that breaks finishes nowhere and costs a rebuild.
 */
export const race = (
  state: LifeState,
  assetId: string,
  style: RaceStyle,
  config: GameConfig,
): RaceResult => {
  const stats = statsOf(state, assetId);
  if (!stats) throw new RacingRejected('that is not a race car');
  const lock = racingLock(state);
  if (lock) throw new RacingRejected(lock.toLowerCase());

  const raced = Number(state.flags.races_this_year ?? 0);
  if (raced >= RACES_A_YEAR) throw new RacingRejected('the season is over');

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'race', assetId, state.character.age, raced);
    state.flags.races_this_year = raced + 1;
    state.step += 1;

    const cls = (String(state.flags.race_class ?? 'bronze') as RaceClass) ?? 'bronze';
    const bar = CLASS_BAR[cls] ?? CLASS_BAR.bronze;

    const lean = style === 'push' ? 1.18 : style === 'conserve' ? 0.88 : 1;
    const strain = style === 'push' ? 26 : style === 'conserve' ? 4 : 13;

    /*
     * The driver is a real part of it: fitness for the physical hours and
     * smarts for knowing when the tyres have gone. Not the largest part —
     * this is a sport about equipment and everybody knows it.
     */
    const driver = state.character.stats.fitness * 0.6 + state.character.stats.smarts * 0.4;
    const pace = (stats.speed * 0.5 + stats.grip * 0.5) * lean + driver * 0.25;

    /*
     * How hard you leaned on it, against how much car there is. Multiplied
     * rather than subtracted: the first pass took a quarter of durability off
     * the strain, which meant a reasonably tough car never broke at all and the
     * three styles were one style.
     */
    const broke = rng.chance((strain * (1 - stats.tough / 150)) / 100);
    if (broke) {
      const repair = Math.round(purse(state) * 0.02) + 40_000_00;
      spend(state, Math.min(repair, purse(state)));
      state.character.stats.happiness = clampStat(state.character.stats.happiness - 6);
      const line = 'It let go on the back straight. You watched the rest from the wall.';
      pushHistory(state, 'random', '💥', line, 35);
      refreshDerived(state, config);
      checkInvariants(state, before);
      return { state, place: 0, line, prize: null, broke: true };
    }

    // A field of five, whose pace is the class standard plus a bit of luck.
    const field = Array.from({ length: 5 }, () => bar.field + rng.int(-14, 14));
    const beaten = field.filter((rival) => pace + rng.int(-8, 8) > rival).length;
    const place = 6 - beaten;

    const points = [0, 10, 6, 4, 2, 1][place] ?? 0;
    const prize = place <= 3 ? Math.round(bar.purse / place) : 0;
    if (prize > 0) state.character.finances.cash += prize;

    state.flags.race_points = Number(state.flags.race_points ?? 0) + points;
    state.character.stats.happiness = clampStat(
      state.character.stats.happiness + (place === 1 ? 8 : place <= 3 ? 3 : -2),
    );

    /*
     * Winning where people can see it is most of what a driver is for, so a
     * podium feeds the same following the acting and music tracks do.
     */
    if (place <= 3) {
      state.character.fame.following += place === 1 ? 4_000 * (RACE_CLASSES.indexOf(cls) + 1) ** 2 : 900;
      state.character.fame.knownFor = 'racing';
    }

    // Up a class, when the points say so.
    const index = RACE_CLASSES.indexOf(cls);
    if (Number(state.flags.race_points) >= bar.points && index < RACE_CLASSES.length - 1) {
      state.flags.race_class = RACE_CLASSES[index + 1]!;
      state.flags.race_points = 0;
      pushHistory(state, 'random', '🏆', `You moved up to ${RACE_CLASSES[index + 1]}.`, 60);
    }

    const line =
      place === 1
        ? 'You won it.'
        : place <= 3
          ? `${place === 2 ? 'Second' : 'Third'}, and you knew where you lost it.`
          : `${place}th. The car was not the problem.`;
    pushHistory(state, 'random', '🏁', line, place === 1 ? 45 : 12);

    refreshDerived(state, config);
    checkInvariants(state, before);
    return { state, place, line, prize: prize > 0 ? money(prize) : null, broke: false };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};

export const racingLock = (state: LifeState): string | null => {
  if (!state.character.alive) return 'You are dead';
  if (state.activeEvent) return 'Answer the open decision first';
  if (state.character.record.incarceration) return 'Not from in here';
  if (state.character.age < 17) return 'You are too young to hold a licence';
  return null;
};

/** Cleared every birthday: a season is a year. */
export const resetRacingYear = (state: LifeState): void => {
  delete state.flags.races_this_year;
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export interface RacingView {
  locked: string | null;
  garage: boolean;
  garagePrice: string;
  garageAffordable: boolean;
  raceClass: RaceClass;
  points: number;
  pointsNeeded: number;
  racesLeft: number;
  cars: Array<{
    id: string;
    label: string;
    emoji: string;
    speed: number;
    grip: number;
    tough: number;
    mods: Array<{ id: string; label: string; emoji: string; price: string; owned: boolean; affordable: boolean }>;
  }>;
  forSale: Array<{ id: string; label: string; emoji: string; price: string; speed: number; grip: number; tough: number; affordable: boolean }>;
}

export const racingView = (state: LifeState): RacingView => {
  const cls = (String(state.flags.race_class ?? 'bronze') as RaceClass) ?? 'bronze';
  const owned = state.assets.filter((a) => state.flags[`race_car_${a.id}`] !== undefined);

  return {
    locked: racingLock(state),
    garage: state.flags.garage === true,
    garagePrice: money(GARAGE_PRICE),
    garageAffordable: GARAGE_PRICE <= purse(state),
    raceClass: cls,
    points: Number(state.flags.race_points ?? 0),
    pointsNeeded: CLASS_BAR[cls]?.points ?? 0,
    racesLeft: Math.max(0, RACES_A_YEAR - Number(state.flags.races_this_year ?? 0)),
    cars: owned.map((asset) => {
      const stats = statsOf(state, asset.id)!;
      return {
        id: asset.id,
        label: asset.label,
        emoji: asset.emoji,
        ...stats,
        mods: MODS.map((mod) => ({
          id: mod.id,
          label: mod.label,
          emoji: mod.emoji,
          price: money(mod.price),
          owned: state.flags[`race_mod_${asset.id}_${mod.id}`] === true,
          affordable: mod.price <= purse(state),
        })),
      };
    }),
    forSale: CARS.map((car) => ({
      id: car.id,
      label: car.label,
      emoji: car.emoji,
      price: money(car.price),
      speed: car.speed,
      grip: car.grip,
      tough: car.tough,
      affordable: car.price <= purse(state),
    })),
  };
};
