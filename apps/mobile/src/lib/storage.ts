/**
 * localStorage that cannot throw.
 *
 * Reading the property itself — not just calling a method on it — raises a
 * SecurityError when site data is blocked, in some private modes, and inside a
 * sandboxed frame with an opaque origin. An unguarded access in a boot path
 * therefore takes the whole app down on browsers that are merely being careful.
 *
 * Losing a saved life is a disappointment. Failing to start is a bug.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Full, blocked, or unavailable. Play continues; it just will not resume. */
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* As above. */
    }
  },
};
