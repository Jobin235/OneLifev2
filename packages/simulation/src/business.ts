import type { Business, LifeState, WorldIndicators } from '@lineage/shared-types';
import { clampStat } from '@lineage/shared-types';
import type { Rng } from './rng.js';

/**
 * A business year. Costs move with the world indicators the business is exposed
 * to — this is the only route by which a fuel index reaches the player, and it
 * reaches them as "your six vans cost $1,900 more a month" (design 1C).
 */
export const advanceBusinessYear = (
  business: Business,
  world: WorldIndicators,
  rng: Rng,
): void => {
  if (business.closed) return;

  const exposurePressure =
    business.exposures.length === 0
      ? 0
      : business.exposures.reduce((sum, key) => {
          const value = world[key as keyof WorldIndicators];
          return sum + (typeof value === 'number' ? (value - 100) / 100 : 0);
        }, 0) / business.exposures.length;

  // Exposed costs rise with the index; revenue only partly follows.
  business.annualCosts = Math.round(business.annualCosts * (1 + exposurePressure * 0.55 + rng.jitter() * 0.03));

  const demand = (world.consumerSpending - 100) / 100;
  const reputationPull = (business.reputation - 50) / 250;
  const growth = demand * 0.5 + reputationPull + rng.jitter() * 0.06;

  business.annualRevenue = Math.max(0, Math.round(business.annualRevenue * (1 + growth)));
  business.growth = Math.round(Math.max(-100, Math.min(100, growth * 100)));

  const margin = business.annualRevenue > 0
    ? (business.annualRevenue - business.annualCosts) / business.annualRevenue
    : -1;

  // Reputation follows whether you can pay people, not whether you are profitable.
  business.reputation = clampStat(business.reputation + (margin > 0.05 ? 1.5 : -2.5));

  if (margin < 0) business.debt += Math.round((business.annualCosts - business.annualRevenue) * 0.6);

  // Headcount follows the size of the thing. A growing haulier hires drivers.
  const target = Math.max(1, business.units * 3 + Math.round(business.annualRevenue / 9_000_000));
  if (target > business.employees) {
    const hired = Math.min(target - business.employees, 4);
    business.employees += hired;
    business.lifetimeEmployees += hired;
  } else if (target < business.employees) {
    business.employees = Math.max(1, business.employees - 2);
  }
};

export const businessProfit = (b: Business): number => b.annualRevenue - b.annualCosts;

export const isFailing = (b: Business): boolean =>
  !b.closed && (businessProfit(b) < 0 || b.debt > b.annualRevenue);

export const closeBusiness = (state: LifeState, businessId: string): void => {
  const b = state.businesses.find((x) => x.id === businessId);
  if (!b) return;
  b.closed = true;
  b.employees = 0;
};
