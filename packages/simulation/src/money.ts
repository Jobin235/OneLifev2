/** Money is whole cents everywhere. Nothing in the simulation uses floats for money. */

export const dollars = (amount: number): number => Math.round(amount * 100);

export const formatMoney = (cents: number): string => {
  const negative = cents < 0;
  const whole = Math.round(Math.abs(cents) / 100);
  const body =
    whole >= 1_000_000
      ? `${(whole / 1_000_000).toFixed(whole >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
      : whole.toLocaleString('en-US');
  return `${negative ? '−' : ''}$${body}`;
};

/** Exact form used where the design shows full figures, e.g. "$318,400". */
export const formatMoneyExact = (cents: number): string => {
  const negative = cents < 0;
  const whole = Math.round(Math.abs(cents) / 100);
  return `${negative ? '−' : ''}$${whole.toLocaleString('en-US')}`;
};

export const formatSigned = (cents: number): string =>
  `${cents >= 0 ? '+' : '−'}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
