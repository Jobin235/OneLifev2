import type { Asset, Business } from '@lineage/shared-types';

/** Things events can conjure into a life. Kept here so content stays declarative. */
export const ASSET_TEMPLATES: Record<string, Omit<Asset, 'id' | 'acquiredAtAge'>> = {
  childhood_home: {
    kind: 'house',
    label: 'The house you grew up in',
    emoji: '🏠',
    value: 28_400_000,
    loanOutstanding: 6_100_000,
    annualCost: 1_400_000,
    meaning: 'You grew up in it. Your parents nearly lost it.',
  },
  first_house: {
    kind: 'house',
    label: 'A house of your own',
    emoji: '🏠',
    value: 24_000_000,
    loanOutstanding: 19_000_000,
    annualCost: 1_800_000,
    meaning: null,
  },
  apartment: {
    kind: 'apartment',
    label: 'A small apartment',
    emoji: '🏢',
    value: 11_000_000,
    loanOutstanding: 9_000_000,
    annualCost: 900_000,
    meaning: null,
  },
  car: {
    kind: 'car',
    label: 'A car that mostly starts',
    emoji: '🚗',
    value: 800_000,
    loanOutstanding: 0,
    annualCost: 240_000,
    meaning: null,
  },
};

export const BUSINESS_TEMPLATES: Record<
  string,
  Omit<Business, 'id' | 'foundedAtAge' | 'cityId'>
> = {
  hauling: {
    name: 'Hauling',
    emoji: '🚚',
    industry: 'Transport',
    equity: 100,
    annualRevenue: 9_600_000,
    annualCosts: 8_200_000,
    employees: 1,
    lifetimeEmployees: 1,
    reputation: 50,
    growth: 0,
    debt: 0,
    unitLabel: 'vans',
    units: 1,
    exposures: ['fuel', 'wages', 'consumerSpending'],
    closed: false,
  },
  diner: {
    name: 'Diner',
    emoji: '🍜',
    industry: 'Food',
    equity: 100,
    annualRevenue: 14_000_000,
    annualCosts: 12_800_000,
    employees: 3,
    lifetimeEmployees: 3,
    reputation: 50,
    growth: 0,
    debt: 0,
    unitLabel: 'locations',
    units: 1,
    exposures: ['food', 'wages', 'consumerSpending'],
    closed: false,
  },
  workshop: {
    name: 'Workshop',
    emoji: '🔧',
    industry: 'Trades',
    equity: 100,
    annualRevenue: 7_200_000,
    annualCosts: 6_100_000,
    employees: 1,
    lifetimeEmployees: 1,
    reputation: 50,
    growth: 0,
    debt: 0,
    unitLabel: 'bays',
    units: 1,
    exposures: ['housingCost', 'wages'],
    closed: false,
  },
};

/** Named after the family, the way a small company usually is. */
export const businessNameFor = (templateId: string, surname: string): string => {
  const template = BUSINESS_TEMPLATES[templateId];
  return template ? `${surname} ${template.name}` : `${surname} & Co.`;
};
