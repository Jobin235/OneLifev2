import type { GameConfig } from '@lineage/config';
import type { LifeState } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import { pushHistory } from './history.js';

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

  /*
   * Everything that will actually be charged, in one number.
   *
   * Asset upkeep and debt payments used to be added separately inside
   * settleYear, so the figure the Money screen showed was smaller than the one
   * taken — and dependants were counted here *and* there, so children were paid
   * for twice. If the player is shown a total, that total has to be the total.
   */
  const assetUpkeep = state.assets.reduce((sum, a) => sum + a.annualCost, 0);

  /*
   * Owning where you live replaces paying for where you live.
   *
   * Without this, buying a house was strictly worse than not buying one: it took
   * the cash, added upkeep, and changed nothing else. Roughly a third of an
   * ordinary year's spending is rent, and a homeowner stops paying it — which is
   * the entire reason anybody buys a house, and the reason the shop is worth
   * opening at all.
   */
  const owned = state.assets.some((a) => a.kind === 'house' || a.kind === 'apartment');
  const housing = owned ? 0 : Math.round(base * studentDiscount * 0.34);

  character.finances.annualExpenses =
    Math.round(base * studentDiscount * 0.66) +
    housing +
    inflation +
    dependents * config.money.perChildAnnualCost +
    assetUpkeep;
};

/**
 * What things are worth after another year of owning them.
 *
 * Assets used to hold their purchase price for ever, which made buying and
 * selling pointless in both directions — you could never lose on a car and never
 * gain on a house, so net worth was just a record of what you had spent.
 */
/**
 * Keeps what an asset still owes in step with the debt that bought it.
 *
 * The two are stored separately — the debt so the player can see who they owe,
 * the asset so selling can work out what is actually left over — and if they
 * drift apart you can sell a house you finished paying for and hand the bank
 * the proceeds anyway.
 */
export const syncAssetLoans = (state: LifeState): void => {
  for (const asset of state.assets) {
    if (asset.loanOutstanding <= 0) continue;
    const debt = state.character.finances.debts.find((d) => d.label.endsWith(asset.label));
    asset.loanOutstanding = debt?.balance ?? 0;
  }
};

export const driftAssetValues = (state: LifeState, rng: { jitter: () => number }): void => {
  for (const asset of state.assets) {
    const rate = ASSET_DRIFT[asset.kind] ?? -0.03;
    const noise = rng.jitter() * 0.02;
    asset.value = Math.max(
      // A car is worth something as scrap; nothing goes to zero.
      Math.round(asset.value * 0.05),
      Math.round(asset.value * (1 + rate + noise)),
    );
  }
};

/**
 * Houses drift up with the market, cars fall off a cliff and keep falling, and
 * the things people buy to enjoy sit somewhere in between.
 */
const ASSET_DRIFT: Record<string, number> = {
  house: 0.035,
  apartment: 0.03,
  investment: 0.05,
  collectible: 0.02,
  car: -0.12,
  luxury: -0.04,
};

/** What the year's money actually did, in words, for the log. */
export interface YearOfMoney {
  wentWithout: number;
  drewOnSavings: number;
  debtInterest: number;
}

export const settleYear = (state: LifeState, config: GameConfig): YearOfMoney => {
  const { character } = state;
  const f = character.finances;

  /*
   * What a business pays you is income, and has to be visible as income.
   *
   * This was computed here and never written back, so the Money screen reported
   * a salary of $54,800 while $1.18M a year landed in savings from a haulage
   * firm it never mentioned. That is the whole of "money doesn't add up".
   */
  const businessIncome = state.businesses
    .filter((b) => !b.closed)
    .reduce((sum, b) => sum + Math.round(((b.annualRevenue - b.annualCosts) * b.equity) / 100), 0);

  f.otherIncome = Math.max(0, businessIncome);

  const gross = f.salary + f.otherIncome;
  const tax = Math.round(gross * config.money.taxRate);
  const net = gross - tax;

  /*
   * Debts are paid down, not merely accrued.
   *
   * A minimum payment comes out of the year like any other bill, which is how
   * debt actually behaves — a mortgage taken at twenty-eight should be smaller
   * at fifty, not larger. Without this a balance only ever fell when there was
   * spare cash at the end of the year, so a poor character carried a growing
   * mortgage for forty-seven years.
   *
   * The payment is capped at a share of income so it cannot itself bankrupt
   * somebody; what it cannot cover simply takes longer.
   */
  /*
   * A student loan is repaid out of income, not out of its own balance.
   *
   * Charging eight per cent of the balance meant a $124,000 degree took a third
   * of a $30,000 salary for life, so a graduate never had a spare dollar in
   * forty years — which is not how income-driven repayment works and is not a
   * game. Everything else keeps the balance-based minimum, because a mortgage
   * really does want its payment whatever you earn.
   */
  const minimumPayments = f.debts.reduce((sum, d) => {
    if (d.label.startsWith('Student loan')) {
      return sum + Math.min(d.balance, Math.round(net * 0.1));
    }
    return sum + Math.max(Math.round(d.balance * 0.08), Math.min(d.balance, 60_000));
  }, 0);
  const affordablePayment = Math.min(minimumPayments, Math.round(net * 0.25));

  /*
   * The first year a loan is actually being repaid is worth saying out loud.
   * A player who took a loan at eighteen should be told when the repayments
   * start, not left to notice a number moving.
   */
  if (
    affordablePayment > 0 &&
    !state.flags.repaying_student_loan &&
    f.debts.some((d) => d.label.startsWith('Student loan'))
  ) {
    state.flags.repaying_student_loan = true;
    pushHistory(
      state,
      'money',
      '🏦',
      'You started paying back your student loan for university.',
      40,
    );
  }

  let toRepay = Math.max(0, affordablePayment);
  for (const debt of [...f.debts].sort((a, b) => b.rate - a.rate)) {
    if (toRepay <= 0) break;
    const paid = Math.min(debt.balance, toRepay);
    debt.balance -= paid;
    toRepay -= paid;
  }
  clearDebts(state, 'paid');

  /*
   * `annualExpenses` already carries asset upkeep and the cost of dependants —
   * `updateCostOfLiving` puts them there so the figure on screen is the figure
   * charged. Adding them again here billed every house and every child twice,
   * which is most of "money doesn't add up": a character with a mortgage and two
   * kids paid for all three of them twice a year, every year, and never got
   * ahead no matter what they earned.
   */
  const expenses = f.annualExpenses + affordablePayment;
  // Each debt carries its own rate, so a family loan does not compound like a
  // credit card and the player can see which one is eating them.
  /*
   * Two rules keep debt from becoming arithmetic rather than a story.
   *
   * A student loan is written off after thirty years, which is roughly how they
   * actually work and stops one at nineteen compounding to $1.5M by seventy-five
   * on somebody who never earned enough to pay a penny of it.
   *
   * And nothing compounds in a year where the character could not cover their
   * own costs — a lender pursuing someone with no income does not turn them into
   * a millionaire debtor, and the going-without penalty is already the cost of
   * that year.
   */
  const age = character.age;
  for (const debt of f.debts) {
    if (debt.label.startsWith('Student loan') && age - debt.takenAtAge >= 30) {
      debt.balance = 0;
      pushHistory(
        state,
        'money',
        '📜',
        'Your student loan was written off. It had been thirty years.',
        45,
      );
    }
  }
  f.debts = f.debts.filter((d) => d.balance > 0);
  f.debt = f.debts.reduce((sum, d) => sum + d.balance, 0);

  const before = f.debt;
  const couldCover = f.cash + f.savings + f.salary + f.otherIncome >= f.annualExpenses;
  if (couldCover) {
    for (const debt of f.debts) {
      const grown = debt.balance + Math.round(debt.balance * debt.rate);
      /*
       * A student loan's balance never rises above what was borrowed.
       *
       * Income-driven repayment pays a share of what you earn, and on a modest
       * salary that share is smaller than the interest — so the balance grew
       * every year for thirty years and a degree became a debt the character
       * could never touch, which is a spiral rather than a decision. Capping it
       * at the principal keeps the loan a real weight without making it a
       * sentence.
       */
      debt.balance = debt.label.startsWith('Student loan')
        ? Math.min(grown, debt.originalAmount)
        : grown;
    }
  }
  f.debt = f.debts.reduce((sum, d) => sum + d.balance, 0);
  const debtInterest = f.debt - before;

  const savingsInterest = Math.round(f.savings * config.money.savingsInterest);
  f.savings += savingsInterest;

  // A loss-making business still costs you money.
  const businessLoss = Math.min(0, businessIncome);
  f.cash += net - expenses + businessLoss;

  /*
   * Surplus goes at the debts before it goes anywhere else, most expensive
   * first. Without this a balance compounds for a whole life no matter how well
   * the character does, which is neither true nor any fun to look at.
   */
  if (f.cash > 0 && f.debts.length > 0) {
    let spare = Math.round(f.cash * 0.5);
    for (const debt of [...f.debts].sort((a, b) => b.rate - a.rate)) {
      if (spare <= 0) break;
      const paid = Math.min(debt.balance, spare);
      debt.balance -= paid;
      spare -= paid;
      f.cash -= paid;
    }
    clearDebts(state, 'paid');
  }

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
  let wentWithout = 0;
  let drewOnSavings = 0;

  if (f.cash < 0) {
    const shortfall = -f.cash;
    drewOnSavings = Math.min(f.savings, shortfall);
    f.savings -= drewOnSavings;
    f.cash = 0;

    wentWithout = shortfall - drewOnSavings;
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

  return { wentWithout, drewOnSavings, debtInterest };

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
  return f.cash + f.savings + f.investments + assetEquity + businessEquity - f.debt;
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


/**
 * Drops settled debts and says so.
 *
 * Clearing a balance is one of the few unambiguously good things that happens to
 * a person's money, and it used to happen in silence — the number simply stopped
 * being there. Saying it is most of what makes twenty years of repayments feel
 * like they were leading somewhere.
 */
/**
 * Debt labels are stored as "Mortgage · A trailer on the edge of town" so the
 * money screen can list them, which does not survive being dropped into a
 * sentence. Split it back apart, and fall back to the age it was taken for the
 * labels that carry no subject — a character can take two loans against the same
 * business a decade apart, and "You paid off the loan" twice reads as the log
 * stuttering rather than as two real debts cleared.
 */
const paidOffLine = (debt: { label: string; takenAtAge: number }): string => {
  const [kind, subject] = debt.label.split('·').map((part) => part.trim());
  if (kind && subject) return `You paid off the ${kind.toLowerCase()} on ${subject.toLowerCase()}.`;
  return `You paid off the ${debt.label.toLowerCase()} you took at ${debt.takenAtAge}.`;
};

const clearDebts = (state: LifeState, how: 'paid'): void => {
  const f = state.character.finances;
  for (const debt of f.debts) {
    if (debt.balance > 0) continue;
    const student = debt.label.startsWith('Student loan');
    pushHistory(
      state,
      'money',
      '🎉',
      student ? 'You fully paid off your student loan for university.' : paidOffLine(debt),
      student ? 60 : 45,
    );
    if (student) delete state.flags.repaying_student_loan;
  }
  void how;
  f.debts = f.debts.filter((d) => d.balance > 0);
  f.debt = f.debts.reduce((sum, d) => sum + d.balance, 0);
};
