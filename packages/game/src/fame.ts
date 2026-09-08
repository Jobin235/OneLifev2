import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import { clampStat, type CareerTrack, type LifeState } from '@lineage/shared-types';
import { applyFameDelta, checkInvariants, makeRng, pushHistory, refreshDerived, type Rng } from '@lineage/simulation';
import { instantiate } from '@lineage/event-engine';
import { requirementsOf } from './jobs.js';

/**
 * Being known.
 *
 * The three-way opinion model — following, fans, haters, and the indifferent
 * majority — has existed since the start and almost nothing fed it. This is
 * what feeds it: a short list of professions the public can actually see you
 * in, an account you post to from thirteen, and a spouse whose fame rubs off on
 * yours. BitLife ties fame to exactly those things, and gates it hard on Looks.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

/**
 * BitLife gates screen fame on a Looks stat this game deliberately does not
 * have — its five are health, happiness, smarts, fitness and charm. The nearest
 * honest reading of "the camera likes you" here is charm, carried a little by
 * how well the character keeps themselves, so that is what the visible
 * professions read instead.
 */
const presence = (stats: { charm: number; fitness: number }): number =>
  stats.charm * 0.7 + stats.fitness * 0.3;

/** Where the game says the word "famous" out loud. */
export const FAMOUS_AT = 300_000;

const short = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
};

/* ------------------------------------------------------------------ *
 * The account
 * ------------------------------------------------------------------ */

/**
 * What a year of posting does.
 *
 * Consistency is most of it: a small account that posts every year outgrows a
 * bigger one that goes quiet, which is both true and the only way to make an
 * activity worth tapping more than once. Presence and smarts set the ceiling.
 */
export const postOnline = (state: LifeState, rng: Rng): { line: string; viral: boolean } => {
  const { character } = state;
  const fame = character.fame;
  /*
   * Two flags, not one: `posting_run` is how many years in a row they have kept
   * it up and survives the year end, `posted_this_year` is what the year end
   * reads to decide whether the account went quiet. Folding them together made
   * every year look like the first one.
   */
  const streak = Number(state.flags.posting_run ?? 0) + 1;
  state.flags.posting_run = streak;
  state.flags.posted_this_year = true;

  const appeal = presence(character.stats) * 0.8 + character.stats.smarts * 0.2;
  const momentum = Math.min(3.2, 1 + streak * 0.22);
  const base = Math.max(40, Math.round((appeal - 25) * 26 * momentum));
  const growth = Math.max(20, Math.round(base + fame.following * (0.1 + appeal / 900)));

  /*
   * The two events every account lives in fear and hope of. A scandal takes
   * roughly twice what a viral moment gives, which is the ratio BitLife uses
   * and the reason a career built on this is nervous work.
   */
  if (rng.chance(0.1 + appeal / 1400)) {
    const gained = growth * rng.int(6, 22);
    applyFameDelta(character, { following: gained, fans: 8, knownFor: fame.knownFor ?? 'posting' });
    return { line: `Something you posted went everywhere. ${short(gained)} new followers.`, viral: true };
  }

  if (fame.following > 8_000 && rng.chance(0.07)) {
    const lost = Math.round(fame.following * (0.1 + rng.next() * 0.25));
    applyFameDelta(character, { following: -lost, haters: 16, fans: -6 });
    character.stats.happiness = clampStat(character.stats.happiness - 8);
    return { line: `An old post of yours resurfaced. You lost ${short(lost)} followers over it.`, viral: false };
  }

  applyFameDelta(character, { following: growth, fans: 2, knownFor: fame.knownFor ?? 'posting' });
  return { line: `You posted all year and picked up ${short(growth)} followers.`, viral: false };
};

/* ------------------------------------------------------------------ *
 * The year
 * ------------------------------------------------------------------ */

/**
 * One year of being known: what the job does to your name, what a famous
 * partner does for it, and the slow forgetting that happens when neither is
 * true any more.
 */
export const advanceFameYear = (state: LifeState, content: ContentPack, rng: Rng): void => {
  const { character } = state;
  const fame = character.fame;
  const job = state.career.current;
  const track = job ? content.careersById.get(job.trackId) : undefined;

  const wasReach = fame.reach;
  const wasFamous = fame.following >= FAMOUS_AT;

  if (track && track.fameGain > 0) {
    /*
     * The rung matters more than the ladder: an extra is not famous and a movie
     * star is. Presence feeds screen fame the way Looks does in BitLife.
     */
    const rung = track.rungs.findIndex((r) => r.id === job!.rungId);
    const standing = (rung + 1) / track.rungs.length;
    /*
     * Presence is a modifier, not a gate. It used to run from 0.6 to 1.3 and
     * read the *current* stats — which was fine while charm sat at 95 for
     * everybody and stopped being fine when charm started drifting down with
     * age. A sixty-year-old film star is still a film star; the job is most of
     * why anybody knows them.
     */
    const screenLift = track.auditions ? 0.85 + presence(character.stats) / 220 : 1;
    /*
     * Fame compounds — being known is most of how you get known — but not
     * without limit, or one good decade would carry a person past the number of
     * people alive. The cap is where word of mouth stops doing the work for you.
     */
    const gained = Math.round(
      track.fameGain *
        1_200 *
        standing *
        standing *
        screenLift *
        Math.min(5, 1 + fame.following / 70_000),
    );
    applyFameDelta(character, {
      following: gained,
      fans: 3,
      knownFor: track.knownFor ?? undefined,
    });
  } else if (fame.following > 0) {
    /*
     * Nobody stays famous for nothing. Without this, a single good decade at
     * twenty-five leaves a person a household name at eighty, which is not how
     * it works for anybody who is not a Beatle.
     */
    if (state.flags.posted_this_year === undefined) {
      state.flags.posting_run = 0;
      const forgotten = Math.round(fame.following * 0.12);
      if (forgotten > 0) applyFameDelta(character, { following: -forgotten });
    }
  }

  // A famous partner is worth about as much as a job, which is BitLife's rule
  // and is also, dispiritingly, true.
  const partner = state.relationships.find((r) => r.kind === 'spouse' || r.kind === 'partner');
  const partnerNpc = partner ? state.npcs.find((n) => n.id === partner.npcId) : undefined;
  if (partnerNpc && Number(state.flags[`famous_partner_${partnerNpc.id}`] ?? 0) > 0) {
    applyFameDelta(character, {
      following: Math.round(Number(state.flags[`famous_partner_${partnerNpc.id}`]) * 0.06),
    });
  }

  // Whether they posted is a fact about the year just lived; the run is not.
  delete state.flags.posted_this_year;
  delete state.flags.auditions_this_year;

  if (!wasFamous && fame.following >= FAMOUS_AT) {
    pushHistory(
      state,
      'fame',
      '🌟',
      `You are famous now. ${short(fame.following)} people follow you for ${fame.knownFor ?? 'something'}.`,
      80,
    );
  } else if (wasReach !== fame.reach && fame.reach !== 'none') {
    pushHistory(
      state,
      'fame',
      '📣',
      fame.reach === 'global'
        ? 'People recognise you in countries you have never been to.'
        : fame.reach === 'national'
          ? 'You stopped being a local thing.'
          : 'People in your own town started recognising you.',
      55,
    );
  }
  void rng;
};

/* ------------------------------------------------------------------ *
 * Auditions
 * ------------------------------------------------------------------ */

const PARTS: Record<string, string[]> = {
  acting: [
    'a hospital drama, three lines',
    'a soap, recurring if it lands',
    'an advert for a bank',
    'a film nobody has funded yet',
    'a stage revival in a room above a pub',
  ],
  music: [
    'a support slot on a regional tour',
    'a session for somebody else’s record',
    'a residency, Thursdays',
    'a label showcase',
  ],
  modelling: [
    'a catalogue shoot',
    'a runway show nobody important is at',
    'a campaign, if the client agrees',
    'an editorial that pays nothing',
  ],
};

/**
 * The odds in the room.
 *
 * Presence gets you seen; being known already gets you seen at all; and the
 * bigger the profession the worse the odds, which is why every screen shows a
 * different number rather than the same one three times. Deliberately poor —
 * this is a thing you do many times.
 */
const roomChance = (state: LifeState, track: CareerTrack): number => {
  const draw = presence(state.character.stats);
  const known = Math.min(24, state.character.fame.following / 5_000);
  const wanted = Math.max(0.55, 1 - Math.max(0, track.fameGain - 5) * 0.06);
  return Math.max(0.04, Math.min(0.62, ((draw * 0.75 + known) / 190) * wanted));
};

/**
 * You do not apply to be an actor. You go up for things and are mostly turned
 * down, which is the whole texture of the profession and the reason it needs
 * its own way in rather than the ordinary job market.
 */
export const openAudition = (
  state: LifeState,
  trackId: string,
  content: ContentPack,
  rng: Rng,
): boolean => {
  const definition = content.eventsById.get('audition');
  const track = content.careersById.get(trackId);
  if (!definition || !track) return false;

  const part = rng.pick(PARTS[trackId] ?? ['something they would not describe']);
  const chance = roomChance(state, track);

  state.flags.audition_track = trackId;
  state.flags.audition_part = part;
  state.flags.audition_label = track.label.toLowerCase();
  state.flags.audition_chance = Math.round(chance * 100);
  state.flags.audition_result = '';
  state.flags.audition_result_title = '';

  const instance = instantiate({ definition, bindings: {}, score: 0, scheduled: null }, state, {
    state,
    world: null,
    bindings: {},
  } as never);
  instance.stake = { label: 'They are seeing', value: `${rng.int(40, 400)} people` };
  /*
   * The odds go on the button rather than in the prose. A number the player can
   * see is the difference between a gamble and a guess, and this one is low
   * enough that hiding it would read as a cheat when the answer came back no.
   */
  const safe = instance.choices.find((c) => c.id === 'safe');
  if (safe) safe.quality = Math.round(chance * 100);

  state.activeEvent = instance;
  state.gameState = 'EVENT_AVAILABLE';
  return true;
};

/** Casts you, or does not. Called from the deferred layer. */
export const settleAudition = (
  state: LifeState,
  effort: 'safe' | 'bold',
  content: ContentPack,
  rng: Rng,
  hire: (trackId: string) => void,
): void => {
  const trackId = String(state.flags.audition_track ?? '');
  const part = String(state.flags.audition_part ?? 'the part');
  const base = Number(state.flags.audition_chance ?? 20) / 100;

  /*
   * Playing it safe is a smaller chance of a bigger nothing; going for it is
   * roughly a coin flip on the same odds, doubled or halved. Nobody who ever
   * got cast did it by being unmemorable.
   */
  const chance = effort === 'bold' ? (rng.chance(0.5) ? base * 2 : base * 0.5) : base;

  if (rng.chance(Math.min(0.9, chance)) && content.careersById.has(trackId)) {
    hire(trackId);
    state.flags.audition_result_title = 'You got it';
    state.flags.audition_result = `They called the next morning. You are doing ${part}.`;
    state.flags.audition_history = `You were cast in ${part}.`;
    state.character.stats.happiness = clampStat(state.character.stats.happiness + 12);
  } else {
    state.flags.audition_result_title = 'Not this time';
    state.flags.audition_result = rng.pick([
      'They were lovely about it and you never heard from them again.',
      'They went another way. Nobody said which way.',
      'You found out it was cast before you walked in.',
      'They said you were very close, which they say.',
    ]);
    state.flags.audition_history = `You auditioned for ${part} and did not get it.`;
    state.character.stats.happiness = clampStat(state.character.stats.happiness - 3);
  }

  for (const key of ['audition_track', 'audition_part', 'audition_label', 'audition_chance']) {
    delete state.flags[key];
  }
};

/** The line the fame screen leads with. */
export const fameLine = (state: LifeState): string => {
  const fame = state.character.fame;
  if (fame.following === 0) return 'Nobody knows who you are.';
  if (fame.following < FAMOUS_AT) {
    return `${short(fame.following)} people follow you. Not famous, but not nobody.`;
  }
  return `${short(fame.following)} people follow you for ${fame.knownFor ?? 'something'}.`;
};

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export class AuditionRejected extends Error {}

/** How many rooms you can get into in one year. */
const AUDITIONS_A_YEAR = 3;

export interface AuditionRow {
  trackId: string;
  label: string;
  /** "Screen" — the industry, so two acting-ish rows are distinguishable. */
  industry: string;
  /** The rung you would start on, named. */
  startsAs: string;
  requirements: string[];
  qualified: boolean;
  missing: string | null;
  /** Rough odds in the room, as a percentage, before you pick how to play it. */
  chance: number;
}

export interface FameView {
  line: string;
  following: number;
  followingShort: string;
  fans: number;
  haters: number;
  reach: string;
  knownFor: string | null;
  famous: boolean;
  /** Whether they can post this year, and why not when they cannot. */
  posting: { available: boolean; locked: string | null; streak: number };
  auditionsLeft: number;
  auditions: AuditionRow[];
}

const REACH_LINE: Record<string, string> = {
  none: 'Nobody',
  local: 'Your town',
  national: 'Your country',
  global: 'Most places',
};

export const fameView = (state: LifeState, content: ContentPack): FameView => {
  const { character } = state;
  const fame = character.fame;
  const used = Number(state.flags.auditions_this_year ?? 0);
  const inside = state.character.record.incarceration !== null;

  const auditions: AuditionRow[] = content.careers
    .filter((t) => t.auditions && t.id !== state.career.current?.trackId)
    .filter((t) => t.countryIds.length === 0 || t.countryIds.includes(character.countryId))
    .map((track) => {
      const { lines, missing } = requirementsOf(state, track);
      return {
        trackId: track.id,
        label: track.label,
        industry: track.industry,
        startsAs: track.rungs[0]!.title,
        requirements: lines,
        qualified: missing.length === 0,
        missing: missing[0] ?? null,
        chance: Math.round(roomChance(state, track) * 100),
      };
    });

  return {
    line: fameLine(state),
    following: fame.following,
    followingShort: short(fame.following),
    fans: fame.fans,
    haters: fame.haters,
    reach: REACH_LINE[fame.reach] ?? 'Nobody',
    knownFor: fame.knownFor ?? null,
    famous: fame.following >= FAMOUS_AT,
    posting: {
      available: character.age >= 13 && !inside,
      locked:
        character.age < 13
          ? 'You are too young for an account'
          : inside
            ? 'They took your phone'
            : null,
      streak: Number(state.flags.posting_run ?? 0),
    },
    auditionsLeft: Math.max(0, AUDITIONS_A_YEAR - used),
    auditions,
  };
};

/**
 * Go up for something.
 *
 * Rate-limited the way applications are, and for the same reason: without a cap
 * the correct play is to audition until the dice land, which turns a career of
 * near-misses into a formality with extra taps.
 */
export const audition = (
  state: LifeState,
  trackId: string,
  content: ContentPack,
  config: GameConfig,
): LifeState => {
  if (!state.character.alive) throw new AuditionRejected('a dead character cannot audition');
  if (state.activeEvent) throw new AuditionRejected('answer the open decision first');
  if (state.character.record.incarceration) throw new AuditionRejected('not from in here');
  if (state.character.age < 10) throw new AuditionRejected('you are too young for this');

  const track = content.careersById.get(trackId);
  if (!track || !track.auditions) throw new AuditionRejected('nobody is casting for that');

  const { missing } = requirementsOf(state, track);
  if (missing.length > 0) throw new AuditionRejected(missing[0]!.toLowerCase());

  const used = Number(state.flags.auditions_this_year ?? 0);
  if (used >= AUDITIONS_A_YEAR) {
    throw new AuditionRejected('you have been up for enough this year');
  }

  const before = structuredClone(state);
  try {
    const rng = makeRng(state.seed, 'audition', trackId, state.character.age, used);
    state.flags.auditions_this_year = used + 1;
    state.step += 1;
    if (!openAudition(state, trackId, content, rng)) {
      throw new AuditionRejected('nobody is casting for that');
    }
    refreshDerived(state, config);
    checkInvariants(state, before);
    return state;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
};
