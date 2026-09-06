import type { Comparison, Condition } from '@lineage/shared-types';
import { resolveField, type ConditionContext, type FieldValue } from './context.js';

const isComparison = (c: Condition): c is Comparison =>
  typeof (c as Comparison).field === 'string' && typeof (c as Comparison).op === 'string';

export const evaluate = (condition: Condition | undefined, ctx: ConditionContext): boolean => {
  if (!condition) return true;
  if ('all' in condition) return condition.all.every((c) => evaluate(c, ctx));
  if ('any' in condition) return condition.any.some((c) => evaluate(c, ctx));
  if ('not' in condition) return !evaluate(condition.not, ctx);
  if (isComparison(condition)) return compare(condition, ctx);
  return false;
};

const compare = (c: Comparison, ctx: ConditionContext): boolean => {
  const actual = resolveField(c.field, ctx);
  const expected = c.value;

  switch (c.op) {
    case 'exists':
      return actual !== undefined && actual !== null && actual !== false;
    case 'not_exists':
      return actual === undefined || actual === null || actual === false;
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return numeric(actual) > numeric(expected);
    case '>=':
      return numeric(actual) >= numeric(expected);
    case '<':
      return numeric(actual) < numeric(expected);
    case '<=':
      return numeric(actual) <= numeric(expected);
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
    case 'in':
      return Array.isArray(expected) && (expected as unknown[]).includes(actual as never);
    case 'not_in':
      return Array.isArray(expected) && !(expected as unknown[]).includes(actual as never);
    default:
      return false;
  }
};

/**
 * Missing fields compare as -Infinity rather than 0, so a condition like
 * `career.performance >= 80` is false for the unemployed instead of accidentally
 * true for anyone whose performance the context does not know about.
 */
const numeric = (value: FieldValue | readonly (string | number)[] | undefined): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined || value === null || Array.isArray(value)) return Number.NEGATIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};
