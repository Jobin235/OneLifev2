import type { GameConfig } from '@lineage/config';
import type { LifeState, Npc, Relationship } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { surfacedScore, type Rng } from '@lineage/simulation';

/**
 * NPCs age when the player does, not on a world clock — spec §8 is emphatic that
 * nothing about the player's people moves while they are offline.
 *
 * Simulation depth follows the relationship band (§24): the spouse and the children
 * get a real year each; a drifted acquaintance gets a birthday and nothing else.
 */
export const advanceNpcYear = (state: LifeState, config: GameConfig, rng: Rng): NpcYearReport => {
  const report: NpcYearReport = { deaths: [], childMilestones: [], moodShifts: [] };
  const relByNpc = new Map(state.relationships.map((r) => [r.npcId, r]));

  for (const npc of state.npcs) {
    if (!npc.alive) continue;
    npc.age += 1;

    const rel = relByNpc.get(npc.id);
    if (!rel) continue;

    if (npc.tier === 'tier1') {
      advanceTier1(npc, rel, state, rng, report);
    } else if (npc.tier === 'tier2') {
      // Cheap drift only: they have a life, we just don't render it.
      if (npc.stats) {
        npc.stats.health = clampStat(npc.stats.health - (npc.age > 55 ? 1.5 : 0.3));
      }
    }

    /*
     * A death this life has already witnessed happens again, on schedule.
     *
     * Rewinding past somebody's death does not save them — that is the Time
     * Machine's one rule with teeth, and it is what stops it being a cheat code
     * for grief. The fate is carried across the rewind rather than rolled back,
     * so the engine finds it waiting when the year comes round again.
     */
    const fate = state.fated.find((f) => f.npcId === npc.id);
    if (fate) {
      if (npc.age >= fate.atAge) {
        npc.alive = false;
        report.deaths.push({ npc, relationship: rel, cause: fate.cause });
      }
      continue;
    }

    if (rollNpcDeath(npc, rng)) {
      npc.alive = false;
      report.deaths.push({ npc, relationship: rel, cause: null });
    }
  }

  void config;
  return report;
};

export interface NpcYearReport {
  /** `cause` is set only when this death is a repeat, fixed by an earlier run. */
  deaths: Array<{ npc: Npc; relationship: Relationship; cause: string | null }>;
  /** Children crossing an age that unlocks new content (design 5G). */
  childMilestones: Array<{ npc: Npc; milestone: string }>;
  moodShifts: Array<{ npc: Npc; onTheirMind: string }>;
}

const advanceTier1 = (
  npc: Npc,
  rel: Relationship,
  state: LifeState,
  rng: Rng,
  report: NpcYearReport,
): void => {
  if (npc.stats) {
    npc.stats.health = clampStat(npc.stats.health - (npc.age > 50 ? 1.8 : 0.4) + rng.jitter());
    npc.stats.fitness = clampStat(npc.stats.fitness - 0.9 + rng.jitter());

    if (rel.kind === 'child') {
      // A child's stats grow toward what the parent has actually invested in them:
      // closeness is the proxy for showing up. Design 5G — you influence, not control.
      const attention = (rel.dimensions.closeness - 50) / 25;
      if (npc.age <= 18) {
        npc.stats.smarts = clampStat(npc.stats.smarts + 1.2 + attention);
        npc.stats.happiness = clampStat(npc.stats.happiness + attention * 1.5 + rng.jitter());
        npc.stats.charm = clampStat(npc.stats.charm + 0.6 + attention * 0.5);
      }
      const milestone = CHILD_MILESTONES[npc.age];
      if (milestone) report.childMilestones.push({ npc, milestone });
    }
  }

  if (rel.kind === 'child' && npc.age <= 18) {
    // Missing things is cumulative and quiet: the tally is never shown as a score.
    const missed = Number(state.flags[`missed_${npc.id}`] ?? 0);
    if (missed > 0) {
      rel.dimensions.affection = clampStat(rel.dimensions.affection - Math.min(4, missed * 0.6));
      rel.dimensions.conflict = clampStat(rel.dimensions.conflict + Math.min(3, missed * 0.4));
    }
  }

  const mind = onTheirMind(npc, rel, state, rng);
  if (mind && mind !== rel.onTheirMind) {
    rel.onTheirMind = mind;
    report.moodShifts.push({ npc, onTheirMind: mind });
  }
};

const CHILD_MILESTONES: Record<number, string> = {
  5: 'started school',
  11: 'is nearly a teenager',
  13: 'became a teenager',
  16: 'can leave school',
  18: 'is an adult now',
  21: 'has their own life',
};

/**
 * Design 2B's "ON HER MIND" card. It is written from the relationship's actual
 * state, so it doubles as an honest tell about what event is coming.
 */
const onTheirMind = (
  npc: Npc,
  rel: Relationship,
  state: LifeState,
  rng: Rng,
): string | null => {
  const d = rel.dimensions;
  const years = state.character.age - rel.sinceAge;

  if (d.conflict > 60) return `${npc.firstName} has not let the last one go.`;
  if (rel.kind === 'partner' && years >= 3 && d.romance > 70 && !state.flags.engaged) {
    return "They've been asking about the next few years. They haven't asked directly yet.";
  }
  if (rel.kind === 'spouse' && d.romance < 35) {
    return 'Something has been unspoken for a while now.';
  }
  if (rel.kind === 'child' && npc.age >= 14 && d.closeness < 45) {
    return `${npc.firstName} has stopped mentioning things to you.`;
  }
  if (rel.kind === 'child' && npc.age >= 8 && d.closeness > 75) {
    return `${npc.firstName} wants to be wherever you are.`;
  }
  const unresolved = rel.memories.find((m) => !m.resolved && m.weight >= 60);
  if (unresolved && rng.chance(0.4)) return unresolved.line;
  return null;
};

const rollNpcDeath = (npc: Npc, rng: Rng): boolean => {
  if (npc.age < 40) return rng.chance(0.0006);
  const base = 0.0002 * Math.exp(0.095 * (npc.age - 20));
  const frailty = npc.stats ? Math.max(0.5, 1.6 - npc.stats.health / 100) : 1;
  return rng.chance(Math.min(1, base * frailty));
};

/** Who inherits the story (design 4C). Blood first, then whoever is closest. */
export const rankHeirs = (state: LifeState): Array<{ npc: Npc; relationship: Relationship }> =>
  state.relationships
    .map((rel) => ({ rel, npc: state.npcs.find((n) => n.id === rel.npcId) }))
    .filter(
      (row): row is { rel: Relationship; npc: Npc } =>
        !!row.npc && row.npc.alive && row.npc.isBloodline && row.rel.kind === 'child',
    )
    .sort((a, b) => b.npc.age - a.npc.age || surfacedScore(b.rel) - surfacedScore(a.rel))
    .map(({ npc, rel }) => ({ npc, relationship: rel }));
