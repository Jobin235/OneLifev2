import type { LifeState, WorldIndicators } from '@lineage/shared-types';
import { netWorth, surfacedScore } from '@lineage/simulation';

/**
 * The read-only view that conditions are evaluated against.
 *
 * Content addresses it with dotted paths (`rel.partner.romance`, `flags.told_her`).
 * Resolution is a lookup, never an expression evaluation — there is no route from
 * a content file into executable code (spec §103).
 */
export interface ConditionContext {
  state: LifeState;
  world: WorldIndicators;
  /** role → npcId, once participants have been bound. */
  bindings: Record<string, string>;
}

export type FieldValue = string | number | boolean | null | undefined;

export const resolveField = (path: string, ctx: ConditionContext): FieldValue => {
  const [head, ...rest] = path.split('.');
  const { state } = ctx;

  switch (head) {
    case 'age':
      return state.character.age;
    case 'sex':
      return state.character.sex;
    case 'alive':
      return state.character.alive;
    case 'country':
      return state.character.countryId;
    case 'city':
      return state.character.cityId;
    case 'generation':
      return state.lineage.generation;

    case 'stats':
      return numberOf(state.character.stats, rest[0]);
    case 'hidden':
      return numberOf(state.character.hidden, rest[0]);

    case 'money':
      return resolveMoney(rest[0], ctx);

    case 'career':
      return resolveCareer(rest[0], ctx);

    case 'education':
      return resolveEducation(rest[0], ctx);

    case 'business':
      return resolveBusiness(rest[0], ctx);

    case 'fame':
      return numberOf(state.character.fame, rest[0]) ?? state.character.fame.reach;

    case 'record':
      return resolveRecord(rest[0], ctx);

    case 'health':
      return resolveHealth(rest[0], ctx);

    case 'rel':
      return resolveRelationship(rest[0], rest[1], ctx);

    case 'memory':
      // `memory.<factKey>` is true when any relationship holds that unresolved fact.
      return state.relationships.some((r) =>
        r.memories.some((m) => m.factKey === rest.join('.') && !m.resolved),
      );

    case 'flags':
      return state.flags[rest.join('.')] ?? undefined;

    case 'trait':
      return state.character.traitIds.includes(rest.join('.'));

    case 'habit':
      return state.character.habitIds.includes(rest.join('.'));

    case 'world':
      return ctx.world[rest.join('.') as keyof WorldIndicators];

    case 'count':
      return resolveCount(rest[0], ctx);

    case 'has':
      return resolveHas(rest[0], ctx);

    default:
      return undefined;
  }
};

const numberOf = (obj: Record<string, unknown>, key: string | undefined): number | undefined => {
  if (!key) return undefined;
  const value = obj[key];
  return typeof value === 'number' ? value : undefined;
};

const resolveMoney = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  const f = state.character.finances;
  switch (key) {
    case 'cash':
      return f.cash;
    case 'savings':
      return f.savings;
    case 'debt':
      return f.debt;
    case 'liquid':
      return f.cash + f.savings;
    case 'net':
      return netWorth(state);
    case 'salary':
      return f.salary;
    default:
      return undefined;
  }
};

const resolveCareer = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  const job = state.career.current;
  switch (key) {
    case 'employed':
      return job !== null;
    case 'retired':
      return state.career.retired;
    case 'track':
      return job?.trackId;
    case 'title':
      return job?.title;
    case 'employer':
      return job?.employerName;
    case 'performance':
      return job?.performance ?? 0;
    case 'satisfaction':
      return job?.satisfaction ?? 0;
    case 'years_in_role':
      return job?.yearsInRole ?? 0;
    case 'experience':
      return state.career.totalExperience;
    default:
      return undefined;
  }
};

const resolveEducation = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  const e = state.education.current;
  switch (key) {
    case 'stage':
      return state.education.highestCompleted;
    case 'enrolled':
      return e !== null;
    case 'current_stage':
      return e?.stage;
    case 'grade':
      return e?.gradePoints ?? 0;
    case 'year':
      return e?.yearIndex ?? 0;
    case 'major':
      return e?.major ?? undefined;
    case 'debt':
      return e?.debtIncurred ?? 0;
    default:
      return undefined;
  }
};

const resolveBusiness = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  const open = state.businesses.filter((b) => !b.closed);
  const first = open[0];
  switch (key) {
    case 'owns':
      return open.length > 0;
    case 'count':
      return open.length;
    case 'profit':
      return first ? first.annualRevenue - first.annualCosts : 0;
    case 'revenue':
      return first?.annualRevenue ?? 0;
    case 'employees':
      return first?.employees ?? 0;
    case 'units':
      return first?.units ?? 0;
    case 'industry':
      return first?.industry;
    default:
      return undefined;
  }
};

const resolveRecord = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  const r = state.character.record;
  switch (key) {
    case 'clean':
      return r.convictions.length === 0;
    case 'convictions':
      return r.convictions.length;
    case 'incarcerated':
      return r.incarceration !== null;
    case 'years_served':
      return r.incarceration?.yearsServed ?? 0;
    case 'years_left':
      return r.incarceration ? r.incarceration.totalYears - r.incarceration.yearsServed : 0;
    default:
      return undefined;
  }
};

const resolveHealth = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  switch (key) {
    case 'conditions':
      return state.character.conditions.length;
    case 'untreated':
      return state.character.conditions.filter((c) => !c.treated).length;
    default:
      // `health.<conditionId>` → does the character have it?
      return key ? state.character.conditions.some((c) => c.id === key) : undefined;
  }
};

const resolveRelationship = (
  role: string | undefined,
  field: string | undefined,
  ctx: ConditionContext,
): FieldValue => {
  if (!role) return undefined;
  const { state, bindings } = ctx;

  // A role either names a binding made for this event, or a relationship kind.
  const npcId = bindings[role];
  const rel = npcId
    ? state.relationships.find((r) => r.npcId === npcId)
    : state.relationships.find((r) => r.kind === role);
  if (!rel) return field === 'exists' ? false : undefined;

  const npc = state.npcs.find((n) => n.id === rel.npcId);
  switch (field) {
    case undefined:
    case 'exists':
      return true;
    case 'score':
      return surfacedScore(rel);
    case 'band':
      return rel.band;
    case 'kind':
      return rel.kind;
    case 'age':
      return npc?.age;
    case 'alive':
      return npc?.alive ?? false;
    case 'years':
      return state.character.age - rel.sinceAge;
    default: {
      const dimension = numberOf(rel.dimensions, field);
      if (dimension !== undefined) return dimension;
      // `rel.<role>.remembers.<factKey>`
      if (field === 'remembers') return undefined;
      return undefined;
    }
  }
};

const resolveCount = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  switch (key) {
    case 'children':
      return state.relationships.filter((r) => r.kind === 'child').length;
    case 'friends':
      return state.relationships.filter((r) => r.kind === 'friend' || r.kind === 'best_friend').length;
    case 'close':
      return state.relationships.filter((r) => r.band === 'close').length;
    case 'assets':
      return state.assets.length;
    case 'siblings':
      return state.relationships.filter((r) => r.kind === 'sibling').length;
    default:
      return undefined;
  }
};

const resolveHas = (key: string | undefined, { state }: ConditionContext): FieldValue => {
  switch (key) {
    case 'partner':
      return state.relationships.some((r) => r.kind === 'partner' || r.kind === 'spouse');
    case 'spouse':
      return state.relationships.some((r) => r.kind === 'spouse');
    case 'child':
      return state.relationships.some((r) => r.kind === 'child');
    case 'business':
      return state.businesses.some((b) => !b.closed);
    case 'house':
      return state.assets.some((a) => a.kind === 'house' || a.kind === 'apartment');
    case 'job':
      return state.career.current !== null;
    case 'debt':
      return state.character.finances.debt > 0;
    default:
      return undefined;
  }
};
