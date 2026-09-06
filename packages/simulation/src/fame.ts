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
      const scale = 100 / (fans + haters);
      fans = Math.round(fans * scale);
      haters = Math.round(haters * scale);
    }
    fame.fans = fans;
    fame.haters = haters;
    fame.indifferent = Math.max(0, 100 - fans - haters);
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
