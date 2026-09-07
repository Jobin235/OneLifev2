import type { GameConfig } from '@lineage/config';
import type { Effect, LifeState, Relationship, RelationshipKind } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import {
  applyFameDelta,
  fameVolatility,
  formatMoneyExact,
  leaveJob,
  makeId,
  type Rng,
} from '@lineage/simulation';

export interface EffectContext {
  state: LifeState;
  config: GameConfig;
  rng: Rng;
  /** role → npcId */
  bindings: Record<string, string>;
  /** Effects that could not be applied here and are handed back to the caller. */
  deferred: Effect[];
}

export interface AppliedDelta {
  text: string;
  positive: boolean;
}

const STAT_DISPLAY: Record<string, [string, string]> = {
  health: ['❤️', 'Health'],
  happiness: ['😊', 'Happiness'],
  smarts: ['🧠', 'Smarts'],
  fitness: ['💪', 'Fitness'],
  charm: ['😎', 'Charm'],
};

/**
 * Applies a list of effects and returns the pills shown on the result card
 * (design 1A). Only changes the player would notice produce a pill — a hidden
 * attribute nudge or a stored memory is felt later, not announced now.
 */
/** Clubs are flavour with a popularity cost attached; the set is deliberately short. */
const CLUBS_BY_STAGE: Record<string, string[]> = {
  primary: ['Choir', 'Chess club', 'Football'],
  secondary: ['Debate', 'Drama', 'Athletics', 'School paper', 'Orchestra', 'Science club'],
  vocational: ['Union branch', 'Trade society'],
  university: ['Student union', 'Rowing', 'Drama society', 'Politics society', 'Rugby', 'Choir'],
  graduate: ['Research group', 'Teaching assistants'],
};

const pickClub = (stage: string, taken: string[], ctx: EffectContext): string | null => {
  const available = (CLUBS_BY_STAGE[stage] ?? []).filter((c) => !taken.includes(c));
  if (available.length === 0) return null;
  return ctx.rng.pick(available);
};

export const applyEffects = (effects: Effect[], ctx: EffectContext): AppliedDelta[] => {
  const deltas: AppliedDelta[] = [];
  for (const effect of effects) {
    const delta = applyEffect(effect, ctx);
    if (delta) deltas.push(delta);
  }
  return deltas;
};

const applyEffect = (effect: Effect, ctx: EffectContext): AppliedDelta | null => {
  const { state, config } = ctx;
  const character = state.character;

  switch (effect.op) {
    case 'stat': {
      // Fame makes happiness swing twice as hard in both directions (design 5E).
      const scale = effect.stat === 'happiness' ? fameVolatility(character) : 1;
      const applied = Math.round(effect.delta * scale);
      character.stats[effect.stat] = clampStat(character.stats[effect.stat] + applied);
      const [icon, label] = STAT_DISPLAY[effect.stat]!;
      return {
        text: `${icon} ${label} ${applied >= 0 ? '+' : '−'}${Math.abs(applied)}`,
        positive: applied >= 0,
      };
    }

    case 'hidden':
      character.hidden[effect.attr] = clampStat(character.hidden[effect.attr] + effect.delta);
      return null;

    case 'money': {
      spend(state, effect.delta);
      return {
        text: `${effect.delta >= 0 ? '+' : '−'}${formatMoneyExact(Math.abs(effect.delta))}`,
        positive: effect.delta >= 0,
      };
    }

    case 'debt':
      character.finances.debt = Math.max(0, character.finances.debt + effect.delta);
      return {
        text: `${effect.delta >= 0 ? 'Debt +' : 'Debt −'}${formatMoneyExact(Math.abs(effect.delta))}`,
        positive: effect.delta < 0,
      };

    case 'salary': {
      const before = character.finances.salary;
      if (effect.multiplier) character.finances.salary = Math.round(before * effect.multiplier);
      if (effect.delta) character.finances.salary += effect.delta;
      character.finances.salary = Math.max(0, character.finances.salary);
      if (state.career.current) state.career.current.salary = character.finances.salary;
      const change = character.finances.salary - before;
      if (change === 0) return null;
      return {
        text: `Salary ${change > 0 ? '+' : '−'}${formatMoneyExact(Math.abs(change))}`,
        positive: change > 0,
      };
    }

    case 'relationship': {
      const rel = bind(ctx, effect.target);
      if (!rel) return null;
      rel.dimensions[effect.dimension] = clampStat(rel.dimensions[effect.dimension] + effect.delta);
      rel.lastContactAge = character.age;
      return null;
    }

    case 'remember': {
      const rel = bind(ctx, effect.target);
      if (!rel) return null;
      rel.memories.push({
        id: makeId('mem', state.seed, rel.npcId, effect.factKey, state.step),
        atAge: character.age,
        factKey: effect.factKey,
        line: effect.line,
        weight: effect.weight,
        data: effect.data,
        resolved: false,
      });
      return null;
    }

    case 'resolve_memory': {
      const rel = bind(ctx, effect.target);
      if (!rel) return null;
      for (const memory of rel.memories) {
        if (memory.factKey === effect.factKey) memory.resolved = true;
      }
      return null;
    }

    case 'relationship_kind': {
      const rel = bind(ctx, effect.target);
      if (!rel) return null;
      if (rel.kind !== effect.kind) {
        rel.formerKinds.push(rel.kind);
        rel.kind = effect.kind as RelationshipKind;
        rel.sinceAge = character.age;
      }
      return null;
    }

    case 'trait_add':
      if (!character.traitIds.includes(effect.traitId)) character.traitIds.push(effect.traitId);
      return null;

    case 'trait_remove':
      character.traitIds = character.traitIds.filter((id) => id !== effect.traitId);
      return null;

    case 'habit_add':
      if (!character.habitIds.includes(effect.habitId)) character.habitIds.push(effect.habitId);
      return null;

    case 'habit_remove':
      character.habitIds = character.habitIds.filter((id) => id !== effect.habitId);
      return null;

    case 'condition_add':
      if (!character.conditions.some((c) => c.id === effect.conditionId)) {
        character.conditions.push({
          id: effect.conditionId,
          label: effect.label,
          diagnosedAtAge: character.age,
          treated: false,
          annualHealthDrain: effect.annualHealthDrain,
        });
      }
      return null;

    case 'condition_treat': {
      const condition = character.conditions.find((c) => c.id === effect.conditionId);
      if (condition) condition.treated = true;
      return null;
    }

    case 'flag':
      state.flags[effect.key] = effect.value;
      return null;

    case 'fame': {
      const before = character.fame.following;
      applyFameDelta(character, effect);
      const gained = character.fame.following - before;
      if (gained === 0) return null;
      return { text: `${gained > 0 ? '+' : '−'}${Math.abs(gained).toLocaleString('en-US')} following`, positive: gained > 0 };
    }

    case 'grades': {
      const enrolment = state.education.current;
      // Out of school this is simply nothing, not an error: an event may fire
      // during a year that ended with graduation.
      if (!enrolment) return null;
      enrolment.gradePoints = Math.max(0, Math.min(400, enrolment.gradePoints + effect.delta));
      for (const subject of enrolment.subjects) {
        subject.gradePoints = Math.max(
          0,
          Math.min(400, subject.gradePoints + Math.round(effect.delta * 0.7)),
        );
      }
      return null;
    }

    case 'popularity': {
      const enrolment = state.education.current;
      if (!enrolment) return null;
      enrolment.popularity = clampStat(enrolment.popularity + effect.delta);
      return null;
    }

    case 'join_club': {
      const enrolment = state.education.current;
      if (!enrolment) return null;
      if (enrolment.clubIds.length >= enrolment.clubSlots) return null;
      const clubId = effect.clubId ?? pickClub(enrolment.stage, enrolment.clubIds, ctx);
      if (clubId && !enrolment.clubIds.includes(clubId)) enrolment.clubIds.push(clubId);
      return null;
    }

    case 'drop_out': {
      const enrolment = state.education.current;
      if (!enrolment) return null;
      state.education.history.push({
        stage: enrolment.stage,
        institutionName: enrolment.institutionName,
        major: enrolment.major,
        fromAge: character.age - (enrolment.yearIndex - 1),
        toAge: character.age,
        completed: false,
        finalGradePoints: enrolment.gradePoints,
      });
      state.education.current = null;
      return null;
    }

    case 'performance': {
      const job = state.career.current;
      if (!job) return null;
      job.performance = clampStat(job.performance + effect.delta);
      return null;
    }

    case 'raise': {
      const job = state.career.current;
      if (!job) return null;
      job.salary = Math.round(job.salary * (1 + effect.percent / 100));
      character.finances.salary = job.salary;
      return null;
    }

    case 'quit_job': {
      const job = state.career.current;
      if (!job) return null;
      state.career.history.push({
        trackId: job.trackId,
        employerName: job.employerName,
        title: job.title,
        fromAge: character.age - job.yearsAtEmployer,
        toAge: character.age,
        endedBy: 'quit',
      });
      state.career.current = null;
      character.finances.salary = 0;
      return null;
    }

    case 'reputation':
      // Reputation is carried by charm plus record; the pill is what matters here.
      character.stats.charm = clampStat(character.stats.charm + Math.round(effect.delta * 0.4));
      return null;

    case 'convict': {
      character.record.convictions.push({
        id: makeId('cnv', state.seed, effect.offence, state.step),
        offence: effect.offence,
        atAge: character.age,
        sentenceYears: effect.sentenceYears,
        fine: effect.fine,
        spent: false,
      });
      if (effect.fine > 0) spend(state, -effect.fine);
      if (effect.sentenceYears > 0) {
        leaveJob(state, 'imprisoned');
        character.record.incarceration = {
          facility: effect.facility,
          offence: effect.offence,
          totalYears: effect.sentenceYears,
          yearsServed: 0,
          paroleEligibleIn: Math.max(1, Math.floor(effect.sentenceYears / 2)),
          behaviour: 60,
        };
      }
      return { text: `⚖️ ${effect.offence}`, positive: false };
    }

    case 'career_performance':
      if (state.career.current) {
        state.career.current.performance = clampStat(
          state.career.current.performance + effect.delta,
        );
      }
      return null;

    case 'career_leave':
      leaveJob(state, effect.reason);
      return { text: effect.reason === 'retired' ? 'Retired' : 'Job ended', positive: effect.reason === 'retired' };

    case 'career_close_track':
      if (!state.career.closedTrackIds.includes(effect.trackId)) {
        state.career.closedTrackIds.push(effect.trackId);
      }
      return null;

    case 'business_units': {
      const business = state.businesses.find((b) => !b.closed);
      if (!business) return null;
      const before = business.units;
      business.units = Math.max(0, business.units + effect.delta);
      const scale = before > 0 ? business.units / before : 1;
      business.annualRevenue = Math.round(business.annualRevenue * scale);
      business.annualCosts = Math.round(business.annualCosts * scale);
      return null;
    }

    case 'business_price': {
      const business = state.businesses.find((b) => !b.closed);
      if (!business) return null;
      business.annualRevenue = Math.round(business.annualRevenue * (1 + effect.pct));
      // Raising prices costs you customers, which is why it is not a free win.
      business.reputation = clampStat(business.reputation - Math.abs(effect.pct) * 60);
      return null;
    }

    case 'business_close': {
      const business = state.businesses.find((b) => !b.closed);
      if (business) {
        business.closed = true;
        business.employees = 0;
      }
      return null;
    }

    case 'move_city':
      character.cityId = effect.cityId;
      return null;

    case 'schedule':
      state.pending.push({
        id: makeId('sch', state.seed, effect.eventId, state.step),
        definitionId: effect.eventId,
        dueAtAge: character.age + effect.inYears,
        priorityOverride: effect.priority ?? null,
        participants: effect.carryParticipants ? { ...ctx.bindings } : {},
      });
      return null;

    // These need content or NPC services the pure effect layer does not hold.
    case 'career_promote':
    case 'career_join':
    case 'asset_add':
    case 'asset_sell':
    case 'business_start':
    case 'spawn_npc':
    case 'child_born':
      ctx.deferred.push(effect);
      return null;

    default: {
      const exhaustive: never = effect;
      void exhaustive;
      return null;
    }
  }
  void config;
};

/** Spending draws cash first, then savings, then borrows. */
const spend = (state: LifeState, delta: number): void => {
  const f = state.character.finances;
  if (delta >= 0) {
    f.cash += delta;
    return;
  }
  let owed = -delta;
  const fromCash = Math.min(f.cash, owed);
  f.cash -= fromCash;
  owed -= fromCash;
  if (owed > 0) {
    const fromSavings = Math.min(f.savings, owed);
    f.savings -= fromSavings;
    owed -= fromSavings;
  }
  if (owed > 0) f.debt += owed;
};

const bind = (ctx: EffectContext, target: string): Relationship | undefined => {
  if (target === 'self') return undefined;
  const npcId = ctx.bindings[target] ?? target;
  return ctx.state.relationships.find((r) => r.npcId === npcId);
};
