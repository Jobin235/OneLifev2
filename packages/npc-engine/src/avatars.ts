import type { Sex } from '@lineage/shared-types';
import type { Rng } from '@lineage/simulation';

/**
 * Emoji and sex are chosen together, never independently.
 *
 * Rolling them separately produced people labelled "Brother" with a girl's face,
 * which reads as a bug in the fiction rather than a bug in the code — and the
 * fiction is the product.
 */
const FEMALE = new Set([
  '👩', '👧', '👵', '👩‍🦰', '👩‍💼', '👩‍🏫', '👩‍🔬', '👩‍🦱', '🧓', '👩‍⚕️', '👩‍🎓',
]);
const MALE = new Set([
  '👨', '👦', '👴', '🧔', '👨‍💼', '👨‍🏫', '👨‍🦰', '👨‍⚕️', '👨‍🎓',
]);

/** Faces that read as anybody. Used when a pool has nothing matching. */
const NEUTRAL = ['🧑', '🧒', '🧑‍💼', '🧑‍🏫', '🧑‍🎤', '🧑‍💻'];

export const pickAvatar = (pool: readonly string[], sex: Sex, rng: Rng): string => {
  const wanted = sex === 'female' ? FEMALE : MALE;
  const other = sex === 'female' ? MALE : FEMALE;

  const matching = pool.filter((emoji) => wanted.has(emoji));
  if (matching.length > 0) return rng.pick(matching);

  const neutral = pool.filter((emoji) => !other.has(emoji));
  if (neutral.length > 0) return rng.pick(neutral);

  return rng.pick(NEUTRAL);
};

export const defaultAvatar = (sex: Sex, age: number): string => {
  if (age <= 3) return '👶';
  if (age <= 12) return sex === 'female' ? '👧' : '👦';
  if (age >= 65) return sex === 'female' ? '👵' : '👴';
  return sex === 'female' ? '👩' : '🧑';
};
