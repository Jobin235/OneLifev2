import type { LifeState } from '@lineage/shared-types';

/**
 * The Time Machine.
 *
 * BitLife sells this per use; ours is free for now and gated later, which is
 * why the eligibility question lives in one function rather than being spread
 * through the call sites — `canRewind` is where a paywall would go.
 *
 * It goes back up to eight years, the player picks how far, and it works after
 * death. What it does not do is save anybody: rewinding past a death keeps that
 * person alive only until the year comes round again, and then they die at the
 * same age of the same thing. That rule is enforced by the fate ledger on
 * LifeState, which is carried across a rewind rather than rolled back with
 * everything else. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */

/** How far back the machine reaches. BitLife's number, and a good one. */
export const REWIND_YEARS = 8;

export interface Snapshot {
  /** The character's age at the moment this was taken — before that year ran. */
  atAge: number;
  state: LifeState;
}

export interface RewindOption {
  atAge: number;
  /** "Back to 34" — what the button says. */
  label: string;
  /** "Undoes 3 years" — what it costs you. */
  note: string;
}

/**
 * Keeps the last eight years and drops the rest.
 *
 * Snapshots live beside the save rather than inside it: a LifeState containing
 * eight LifeStates is a schema that cannot describe itself, and a save that
 * carries its own history is nine times the size for no gain.
 */
export const remember = (history: Snapshot[], state: LifeState): Snapshot[] => {
  const next = [
    ...history.filter((s) => s.atAge !== state.character.age),
    { atAge: state.character.age, state: structuredClone(state) },
  ];
  next.sort((a, b) => a.atAge - b.atAge);
  return next.slice(-REWIND_YEARS);
};

/** The years the player could go back to, newest first. Empty means no. */
export const rewindOptions = (history: Snapshot[], state: LifeState): RewindOption[] => {
  const now = state.character.deathAge ?? state.character.age;
  return history
    .filter((s) => s.atAge < now && now - s.atAge <= REWIND_YEARS)
    .sort((a, b) => b.atAge - a.atAge)
    .map((s) => {
      const years = now - s.atAge;
      return {
        atAge: s.atAge,
        label: `Back to ${s.atAge}`,
        note: `Undoes ${years} ${years === 1 ? 'year' : 'years'}`,
      };
    });
};

export class RewindRejected extends Error {}

/**
 * Puts the life back the way it was, minus what it learned about who dies.
 *
 * The fate ledger is the only thing that survives, and it is the whole point:
 * you get your own decisions back and nobody else's ending.
 */
export const rewind = (history: Snapshot[], state: LifeState, toAge: number): LifeState => {
  const now = state.character.deathAge ?? state.character.age;
  const snapshot = history.find((s) => s.atAge === toAge);
  if (!snapshot) throw new RewindRejected('that year is out of reach');
  if (toAge >= now) throw new RewindRejected('that year has not happened yet');
  if (now - toAge > REWIND_YEARS) throw new RewindRejected('that is too far back');

  const restored = structuredClone(snapshot.state);
  restored.fated = structuredClone(state.fated);
  /*
   * A rewind is a step in the life's history, not a reset of it. The step
   * counter carrying on is what stops two different timelines producing the
   * same seeded rolls and replaying the year identically — which would make the
   * machine pointless.
   */
  restored.step = state.step + 1;
  return restored;
};

/** Everything at or after the year you went back to is no longer true. */
export const forget = (history: Snapshot[], toAge: number): Snapshot[] =>
  history.filter((s) => s.atAge <= toAge);
