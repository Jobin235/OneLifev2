import type { Character } from '@lineage/shared-types';

/**
 * Design 5E: "Fame is modelled as a three-way split of public opinion rather than
 * a single number, so a scandal moves the haters bar and not the total."
 *
 * Shares are kept normalised to 100 so the bar always fills.
 */
export const applyFameDelta = (
  character: Character,
  delta: { following?: number; fans?: number; haters?: number; knownFor?: string },
): void => {
  const fame = character.fame;

  if (delta.knownFor) fame.knownFor = delta.knownFor;
  if (delta.following) fame.following = Math.max(0, fame.following + delta.following);

  if (delta.fans || delta.haters) {
    // Opinion moves between the three shares; it is never created or destroyed.
    let fans = fame.fans + (delta.fans ?? 0);
    let haters = fame.haters + (delta.haters ?? 0);
    fans = Math.max(0, fans);
    haters = Math.max(0, haters);
    if (fans + haters > 100) {
      /*
       * The second share takes whatever the first one's rounding leaves.
       * Rounding both independently can overshoot by one — 105 fans and 15
       * haters scale to 88 and 13 — and the `Math.max(0, …)` that used to guard
       * the indifferent share turned that into a state where the three summed
       * to 101 and the invariant threw a year later.
       */
      fans = Math.min(100, Math.round(fans * (100 / (fans + haters))));
      haters = 100 - fans;
    }
    fame.fans = fans;
    fame.haters = haters;
    fame.indifferent = 100 - fans - haters;
  }

  fame.reach =
    fame.following >= 5_000_000
      ? 'global'
      : fame.following >= 250_000
        ? 'national'
        : fame.following >= 5_000
          ? 'local'
          : 'none';
};

export const fameVerdict = (character: Character): string => {
  const { fans, haters } = character.fame;
  if (fans >= 60) return 'Loved';
  if (fans >= 45) return 'Liked';
  if (haters >= 45) return 'Divisive';
  if (haters >= 30) return 'Controversial';
  return 'Known';
};

/** Design 5E: happiness swings twice as hard once you are recognised. */
export const fameVolatility = (character: Character): number =>
  character.fame.reach === 'none' ? 1 : character.fame.reach === 'local' ? 1.4 : 2;
