import type { GameConfig } from '@lineage/config';
import type { LifeState } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';

/**
 * One year of money, settled in the order a person actually experiences it:
 * you earn, you're taxed, you pay what you owe, and what's left is yours.
 *
 * Design 3C shows this back to the player as "every month" in plain language,
 * so the model only needs to be believable, not accurate (spec §137).
 */
/**
 * What it costs this character to exist, this year.
 *
 * Recomputed every year rather than fixed at creation, because the answer changes
 * completely as a life moves: a child's costs are their parents' problem, a
 * prisoner has none, and a parent of three has a lot.
 */
export const updateCostOfLiving = (
  state: LifeState,
  config: GameConfig,
  costOfLivingMultiplier: number,
): void => {
  const { character } = state;

  if (character.record.incarceration) {
    character.finances.annualExpenses = 0;
    return;
  }

  // Still somebody else's dependent: at school, and not earning.
  const atSchool =
    state.education.current?.stage === 'primary' || state.education.current?.stage === 'secondary';
  const parentAlive = state.relationships.some(
    (r) =>
      (r.kind === 'mother' || r.kind === 'father') &&
      state.npcs.find((n) => n.id === r.npcId)?.alive,
  );
  if (character.age < 18 && (atSchool || parentAlive)) {
    character.finances.annualExpenses = 0;
    return;
  }

  const base = Math.round(config.money.baseAnnualExpenses * costOfLivingMultiplier);

  // A student living on loans spends less than a working adult.
  const studentDiscount = state.education.current && !state.career.current ? 0.6 : 1;

  const dependents = state.relationships.filter((r) => {
    if (r.kind !== 'child') return false;
    const npc = state.npcs.find((n) => n.id === r.npcId);
    return !!npc && npc.alive && npc.age < 18;
  }).length;

  /*
   * Lifestyle inflation. People spend what they earn — a bigger house, a newer
   * car, private school — and without it a high earner accumulates an absurd
   * fortune by simply existing. This is what keeps a very successful life landing
   * near the design's $1.4M estate rather than tens of millions.
   */
  const income = character.finances.salary + character.finances.otherIncome;
  const comfortable = base * 2;
  const inflation = income > comfortable ? Math.round((income - comfortable) * 0.34) : 0;

  character.finances.annualExpenses =
    Math.round(base * studentDiscount) + inflation + dependents * config.money.perChildAnnualCost;
};

export const settleYear = (state: LifeState, config: GameConfig): void => {
  const { character } = state;
  const f = character.finances;

  const businessIncome = state.businesses
    .filter((b) => !b.closed)
    .reduce((sum, b) => sum + Math.round(((b.annualRevenue - b.annualCosts) * b.equity) / 100), 0);

  const gross = f.salary + f.otherIncome + Math.max(0, businessIncome);
  const tax = Math.round(gross * config.money.taxRate);
  const net = gross - tax;

  const assetCosts = state.assets.reduce((sum, a) => sum + a.annualCost, 0);
  const childCount = state.relationships.filter((r) => r.kind === 'child').length;
  const dependentCost = childCount * config.money.perChildAnnualCost;

  const expenses = f.annualExpenses + assetCosts + dependentCost;
  // Interest only accrues on debt the character actually took on.
  const debtInterest = Math.round(f.debt * config.money.debtInterest);
  const savingsInterest = Math.round(f.savings * config.money.savingsInterest);

  f.debt += debtInterest;
  f.savings += savingsInterest;

  // A loss-making business still costs you money.
  const businessLoss = Math.min(0, businessIncome);
  f.cash += net - expenses + businessLoss;

  // Overflow into savings so cash stays a plausible current-account figure.
  const cashBuffer = Math.max(expenses, 500_000);
  if (f.cash > cashBuffer * 2) {
    const sweep = f.cash - cashBuffer;
    f.cash -= sweep;
    f.savings += sweep;
  }

  /*
   * Shortfalls do not become debt.
   *
   * Nobody borrows indefinitely against no income, and letting them turns every
   * lean stretch into unpayable compound interest. Instead the character goes
   * without — they move back in, they eat worse, they stop going out — and it
   * shows up where the player will actually feel it. Debt only ever comes from
   * borrowing something specific: a loan, a mortgage, a fine.
   */
  if (f.cash < 0) {
    const shortfall = -f.cash;
    const drawn = Math.min(f.savings, shortfall);
    f.savings -= drawn;
    f.cash = 0;

    const wentWithout = shortfall - drawn;
    if (wentWithout > 0) {
      const severity = Math.min(1, wentWithout / Math.max(1, expenses));
      state.character.stats.happiness = clampStat(
        state.character.stats.happiness - Math.round(severity * 9),
      );
      state.character.stats.health = clampStat(
        state.character.stats.health - Math.round(severity * 2),
      );
    }
  }

  // Debt is serviced from whatever is left above a working buffer, so a mortgage
  // actually clears over a working life instead of outliving the character.
  if (f.debt > 0) {
    const slack = f.savings - cashBuffer;
    if (slack > 0) {
      const repayment = Math.min(f.debt, slack);
      f.debt -= repayment;
      f.savings -= repayment;
    }
  }
};

export const netWorth = (state: LifeState): number => {
  const f = state.character.finances;
  const assetEquity = state.assets.reduce((sum, a) => sum + a.value - a.loanOutstanding, 0);
  const businessEquity = state.businesses
    .filter((b) => !b.closed)
    .reduce((sum, b) => sum + Math.round(((b.annualRevenue - b.annualCosts) * 3 * b.equity) / 100), 0);
  return f.cash + f.savings + assetEquity + businessEquity - f.debt;
};

export const monthlyLines = (
  state: LifeState,
  config: GameConfig,
): Array<{ icon: string; label: string; cents: number }> => {
  const f = state.character.finances;
  const lines: Array<{ icon: string; label: string; cents: number }> = [];
  const perMonth = (annual: number) => Math.round(annual / 12);

  if (f.salary > 0) {
    lines.push({
      icon: '💼',
      label: 'Salary',
      cents: perMonth(Math.round(f.salary * (1 - config.money.taxRate))),
    });
  }
  for (const b of state.businesses.filter((x) => !x.closed)) {
    lines.push({
      icon: b.emoji,
      label: b.name,
      cents: perMonth(Math.round(((b.annualRevenue - b.annualCosts) * b.equity) / 100)),
    });
  }
  for (const a of state.assets.filter((x) => x.annualCost > 0)) {
    lines.push({ icon: a.emoji, label: a.label, cents: -perMonth(a.annualCost) });
  }
  lines.push({ icon: '🍜', label: 'Living', cents: -perMonth(f.annualExpenses) });
  return lines;
};
