/**
 * The only place the client talks to the server.
 *
 * The client holds no game rules: it sends an intent, and renders whatever comes
 * back. Nothing here computes a stat, a balance, or an outcome (spec §80-81).
 */

import { safeStorage } from './storage';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Stands in for a real auth token until Apple/Google sign-in is wired up (§77). */
const userId = (): string => {
  const stored = safeStorage.get('onelife.user');
  if (stored) return stored;
  const fresh = `guest_${Math.random().toString(36).slice(2, 10)}`;
  safeStorage.set('onelife.user', fresh);
  return fresh;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const request = async <T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> => {
  const headers: Record<string, string> = {
    'x-user-id': userId(),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  // Only declare a JSON body when there actually is one — several endpoints
  // (age-up, dismiss) take no body at all.
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    // Spec §116: the client may be offline. It never guesses what would have
    // happened — it says so and stops.
    throw new ApiError('You are offline. Your life is safe on the server.', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? 'Something went wrong.', response.status);
  }
  return (await response.json()) as T;
};

/* ---------------- Types the server actually returns ---------------- */

export interface StatBar {
  key: string;
  icon: string;
  label: string;
  value: number;
  color: string;
}

export interface EventChoice {
  id: string;
  label: string;
  note?: string;
  /** A price on the button, and a bar for what it buys. */
  price?: string;
  quality?: number;
  /** Raises a Confirm sheet carrying this sentence before anything happens. */
  confirm?: string;
  disabled?: boolean;
}

export interface ActiveEvent {
  id: string;
  definitionId: string;
  card: {
    icon: string;
    label: string;
    tint: string;
    color: string;
    /** Named on the popup's header band when the event is about somebody. */
    who: { name: string; emoji: string; relation: string } | null;
  };
  title: string;
  body: string;
  /** The line directly above the buttons: "What will you do?" */
  question: string;
  /** Dropdowns rendered above the buttons; the values ride along with the choice. */
  selects: Array<{
    id: string;
    label: string;
    options: Array<{ value: string; label: string }>;
  }>;
  /** One named quantity: "Possible Sentence: 2 years". */
  stake: { label: string; value: string } | null;
  /** A fact sheet: Name / Gender / Age / Occupation. */
  facts: Array<{ label: string; value: string }>;
  /** Bars beside it: Looks / Smarts / Money / Craziness. */
  meters: Array<{ label: string; value: number }>;
  choices: EventChoice[];
  outcomeTitle: string | null;
  outcomeText: string | null;
  deltas: Array<{ text: string; positive: boolean }>;
}

export interface ActionCard {
  id: string;
  icon: string;
  label: string;
  note: string;
  group: string;
  tint: string;
  noteColor: string;
  /** Times left this year; null when the activity never stops working. */
  timesLeft: number | null;
  available: boolean;
  blockedReason: string | null;
  /** Greyed but visible: something to grow into rather than an error. */
  locked: boolean;
}

export interface LifeView {
  lifeId: string;
  /** Bumps on every mutation; used to refetch panels that have gone stale. */
  revision: number;
  generation: number;
  dateLine: string;
  name: string;
  age: number;
  avatarEmoji: string;
  subtitle: string;
  /** Two or three words under the name: "University Student", "Prisoner". */
  station: string;
  /** Which of the five nav slots the contextual first one is showing. */
  navSlot: 'school' | 'occupation' | 'prison';
  stats: StatBar[];
  jobLine: string;
  money: string;
  /** Bank Balance, and it is allowed to be negative. */
  balance: string;
  gameState: string;
  activeEvent: ActiveEvent | null;
  resolvedEvent: ActiveEvent | null;
  log: Array<{ atAge: number; icon: string; text: string; major: boolean }>;
  canAgeUp: boolean;
  ageUpLabel: string;
  incarcerated: boolean;
  legacy: Legacy | null;
}

export interface Recap {
  age: number;
  lines: Array<{ icon: string; text: string }>;
  statDeltas: Array<{ key: string; icon: string; label: string; value: number; delta: number }>;
  foreshadow: string | null;
}

export interface Legacy {
  ribbon: { id: string; label: string; emoji: string; line: string };
  name: string;
  bornYear: number;
  diedYear: number;
  age: number;
  cityName: string;
  epitaph: string;
  chapters: Array<{ fromAge: number; toAge: number; title: string; body: string }>;
  howPeopleSawYou: Array<{ who: string; verdict: string; line: string; score: number }>;
  whatYouChanged: Array<{ icon: string; line: string }>;
  numbers: Array<{ value: string; label: string }>;
  comparison: string;
  whatYouLeft: string[];
  heirs: Array<{ npcId: string | null; name: string; emoji: string; pitch: string }>;
}

export interface PersonRow {
  npcId: string;
  name: string;
  emoji: string;
  subtitle: string;
  band: 'close' | 'around' | 'drifted';
  scoreIcon: string;
  score: number;
  scoreColor: string;
}

export interface PeopleView {
  total: number;
  headline: string;
  close: PersonRow[];
  around: PersonRow[];
  driftedCount: number;
  driftedLine: string | null;
  drifted: PersonRow[];
}

export interface InteractionCard {
  id: string;
  icon: string;
  label: string;
  /** Cents. */
  cost: number;
  timesLeft: number | null;
  available: boolean;
  blockedReason: string | null;
}

export interface PersonView {
  npcId: string;
  name: string;
  emoji: string;
  header: string;
  descriptor: string;
  meters: Array<{ icon: string; label: string; value: number }>;
  memories: Array<{ atAge: number; line: string }>;
  interactions: InteractionCard[];
  onTheirMind: string | null;
  stats: Array<{ icon: string; label: string; value: number }>;
}

export interface RewindOption {
  atAge: number;
  label: string;
  note: string;
}

export interface StockRow {
  id: string;
  name: string;
  ticker: string;
  blurb: string;
  risk: 'low' | 'medium' | 'high';
  riskBar: number;
  price: string;
  priceCents: number;
  change: string;
  up: boolean;
  shares: number;
  holdingValue: string;
  gain: string;
  gainUp: boolean;
  affordable: boolean;
}

export interface MobView {
  family: string;
  title: string;
  rank: string;
  standing: number;
  standingWord: string;
  cutLine: string;
  earned: string;
  next: string | null;
  made: boolean;
  jobsLeft: number;
  jobs: Array<{
    id: string;
    icon: string;
    label: string;
    note: string;
    available: boolean;
    locked: string | null;
  }>;
}

export interface EscapeView {
  width: number;
  height: number;
  /** One string per row: '#' is a wall you cannot stand on, '.' is floor. */
  rows: string[];
  player: { x: number; y: number };
  guard: { x: number; y: number };
  exit: { x: number; y: number };
  moves: number;
  outcome: string | null;
  legal: string[];
}

export interface RoyalView {
  title: string;
  house: string;
  line: string | null;
  respect: number;
  respectWord: string;
  monarch: boolean;
  origin: string;
  dutiesLeft: number;
  actions: Array<{
    id: string;
    icon: string;
    label: string;
    note: string;
    available: boolean;
    locked: string | null;
  }>;
}

export interface AuditionRow {
  trackId: string;
  label: string;
  industry: string;
  startsAs: string;
  requirements: string[];
  qualified: boolean;
  missing: string | null;
  chance: number;
}

export interface FameView {
  line: string;
  following: number;
  followingShort: string;
  fans: number;
  haters: number;
  reach: string;
  knownFor: string | null;
  famous: boolean;
  posting: { available: boolean; locked: string | null; streak: number };
  auditionsLeft: number;
  auditions: AuditionRow[];
}

export interface PropertyRow {
  assetId: string;
  label: string;
  emoji: string;
  value: string;
  condition: number;
  conditionWord: string;
  tenant: {
    name: string;
    emoji: string;
    rent: string;
    satisfaction: number;
    satisfactionWord: string;
    since: string;
    arrears: string | null;
    note: string;
  } | null;
  marketRent: string;
  amenities: string[];
  actions: Array<{ id: string; label: string; note: string; price: string; available: boolean }>;
}

export interface AmenityRow {
  id: string;
  label: string;
  emoji: string;
  note: string;
  price: string;
  available: boolean;
  owned: boolean;
}

export interface MarketView {
  rows: StockRow[];
  total: string;
  totalCents: number;
  invested: string;
}

export interface PrisonView {
  facility: string;
  offence: string;
  sentence: string;
  yearsLeft: number;
  served: number;
  behaviour: number;
  behaviourLabel: string;
  parole: string;
  inmates: Array<{ npcId: string; name: string; emoji: string }>;
  actions: ActionCard[];
}

export interface SchoolView {
  institution: string;
  stage: string;
  major: string | null;
  yearLine: string;
  debt: string | null;
  subjects: Array<{ name: string; grade: string }>;
  clubs: string[];
  clubSlots: number;
  popularity: number;
  gradePoints: number;
  classmates: Array<{
    npcId: string;
    name: string;
    emoji: string;
    note: string;
    closeness: number;
    isTeacher: boolean;
  }>;
  actions: ActionCard[];
}

export interface WorkView {
  employer: string;
  title: string;
  salary: string;
  yearsIn: number;
  performance: number;
  performanceLabel: string;
  outlook: string;
  ladder: Array<{ title: string; salary: string; current: boolean; reached: boolean }>;
  people: Array<{
    npcId: string;
    name: string;
    emoji: string;
    role: string;
    closeness: number;
    score: number;
  }>;
  actions: ActionCard[];
}

export interface ShopEntry {
  id: string;
  kind: string;
  label: string;
  emoji: string;
  price: string;
  priceCents: number;
  upkeep: string;
  available: boolean;
  blockedReason: string | null;
  owned: boolean;
  /** Whether it can be bought on a loan, and what that would take. */
  finance: {
    available: boolean;
    terms: string;
    depositCents: number;
    blockedReason: string | null;
  };
}

export interface DebtLine {
  id: string;
  label: string;
  holder: string;
  balance: string;
  rate: string;
  sinceAge: number;
}

export interface Opening {
  trackId: string;
  title: string;
  employer: string;
  salary: string;
  salaryCents: number;
  industry: string;
  requirements: string[];
  qualified: boolean;
  missing: string | null;
  chance: number;
}

export interface MoneyView {
  forSale: ShopEntry[];
  debts: DebtLine[];
  netWorth: string;
  monthlyNet: string;
  debtCount: number;
  owned: Array<{ assetId: string | null; emoji: string; label: string; detail: string }>;
  monthly: Array<{ icon: string; label: string; amount: string; positive: boolean }>;
  note: string | null;
}

export interface MoreView {
  tiles: Array<{ id: string; icon: string; label: string; value: string }>;
  storySoFar: string;
  family: { name: string; line: string };
}

export interface CountryOption {
  id: string;
  name: string;
  flag: string;
  region: string;
  changes: Array<{ icon: string; text: string }>;
  cities: Array<{ id: string; name: string; blurb: string }>;
}

/* ---------------- Calls ---------------- */

/**
 * The surface the app talks to. Implemented twice: by `httpApi` against the
 * authoritative server, and by `createLocalApi` which runs the same engine in
 * the browser so the game can be played from a link with no backend.
 */
export type ActOutcome = 'done' | 'overdone' | 'no_further_effect' | 'backfired';

export interface Api {
  countries(): Promise<{ countries: CountryOption[] }>;
  listLives(): Promise<{ lives: Array<{ id: string; name: string; age: number; alive: boolean }> }>;
  newLife(body: {
    firstName?: string;
    lastName?: string;
    countryId: string;
    cityId?: string;
    upbringing: 'rough' | 'getting_by' | 'comfortable';
  }): Promise<{ life: LifeView }>;
  life(lifeId: string): Promise<{ life: LifeView }>;
  ageUp(lifeId: string, idempotencyKey: string): Promise<{ life: LifeView; recap: Recap; died: boolean }>;
  choose(
    lifeId: string,
    eventId: string,
    choiceId: string,
    selections?: Record<string, string>,
  ): Promise<{ life: LifeView }>;
  dismiss(lifeId: string): Promise<{ life: LifeView }>;
  /** `outcome` is 'no_further_effect' when the tap was a deliberate no-op. */
  act(lifeId: string, activityId: string): Promise<{ life: LifeView; outcome: ActOutcome }>;
  succeed(lifeId: string, heirNpcId: string | null): Promise<{ life: LifeView }>;
  people(lifeId: string): Promise<PeopleView>;
  person(lifeId: string, npcId: string): Promise<PersonView>;
  interact(
    lifeId: string,
    npcId: string,
    interactionId: string,
  ): Promise<{ life: LifeView; person: PersonView; warm: boolean; line: string }>;
  actions(lifeId: string): Promise<{ actions: ActionCard[] }>;
  /** Null when the character is not enrolled anywhere. */
  school(lifeId: string): Promise<SchoolView | null>;
  prison(lifeId: string): Promise<PrisonView | null>;
  market(lifeId: string): Promise<MarketView>;
  fame(lifeId: string): Promise<FameView>;
  /** Null when the character holds no title. */
  royal(lifeId: string): Promise<RoyalView | null>;
  /**
   * The standing, plus whether they could get one. `visible` decides whether
   * the row appears at all — somebody with a clean record is not told there is
   * anything to be asked about.
   */
  mob(lifeId: string): Promise<{
    mob: MobView | null;
    eligibility: { open: boolean; reason: string; visible: boolean };
  }>;
  mobAct(
    lifeId: string,
    job: string,
  ): Promise<{ life: LifeView; mob: MobView | null; line: string; cut: string | null }>;
  /** Null when there is no maze on screen. */
  escapeState(lifeId: string): Promise<EscapeView | null>;
  escapeMove(
    lifeId: string,
    move: string,
  ): Promise<{ life: LifeView; escape: EscapeView | null; line: string }>;
  royalAct(
    lifeId: string,
    action: string,
    choice?: string,
  ): Promise<{ life: LifeView; royal: RoyalView | null; line: string; respectAfter: number }>;
  audition(lifeId: string, trackId: string): Promise<{ life: LifeView }>;
  properties(lifeId: string): Promise<PropertyRow[]>;
  amenities(lifeId: string, assetId: string): Promise<AmenityRow[]>;
  manageProperty(
    lifeId: string,
    assetId: string,
    action: string,
    amenityId?: string,
  ): Promise<{ life: LifeView; properties: PropertyRow[] }>;
  trade(
    lifeId: string,
    stockId: string,
    shares: number,
    sell: boolean,
  ): Promise<{ life: LifeView; market: MarketView }>;
  /** The years the Time Machine can reach. Empty means it cannot help. */
  rewindOptions(lifeId: string): Promise<RewindOption[]>;
  rewind(lifeId: string, toAge: number): Promise<LifeView>;
  /** Null when the character has no job. */
  work(lifeId: string): Promise<WorkView | null>;
  openings(lifeId: string): Promise<{ openings: Opening[]; applicationsLeft: number }>;
  applyFor(lifeId: string, trackId: string): Promise<{ life: LifeView; hired: boolean; line: string }>;
  money(lifeId: string): Promise<MoneyView>;
  buy(
    lifeId: string,
    purchasableId: string,
    onFinance?: boolean,
  ): Promise<{ life: LifeView; money: MoneyView }>;
  sell(lifeId: string, assetId: string): Promise<{ life: LifeView; money: MoneyView }>;
  more(lifeId: string): Promise<MoreView>;
  legacy(lifeId: string): Promise<Legacy>;
}

export const httpApi: Api = {
  countries: () => request<{ countries: CountryOption[] }>('/content/countries'),

  listLives: () =>
    request<{ lives: Array<{ id: string; name: string; age: number; alive: boolean }> }>('/lives'),

  newLife: (body: {
    firstName?: string;
    lastName?: string;
    countryId: string;
    cityId?: string;
    upbringing: 'rough' | 'getting_by' | 'comfortable';
  }) => request<{ life: LifeView }>('/lives', { method: 'POST', body: JSON.stringify(body) }),

  life: (lifeId: string) => request<{ life: LifeView }>(`/lives/${lifeId}`),

  /**
   * Carries an idempotency key so a retry after a dropped connection cannot age
   * the character twice (spec §84, §117).
   */
  ageUp: (lifeId: string, idempotencyKey: string) =>
    request<{ life: LifeView; recap: Recap; died: boolean }>(`/lives/${lifeId}/age-up`, {
      method: 'POST',
      idempotencyKey,
    }),

  choose: (lifeId: string, eventId: string, choiceId: string, selections: Record<string, string> = {}) =>
    request<{ life: LifeView }>(`/lives/${lifeId}/events/${eventId}/choose`, {
      method: 'POST',
      body: JSON.stringify({ choiceId, selections }),
    }),

  dismiss: (lifeId: string) =>
    request<{ life: LifeView }>(`/lives/${lifeId}/dismiss`, { method: 'POST' }),

  act: (lifeId: string, activityId: string) =>
    request<{ life: LifeView; outcome: ActOutcome }>(`/lives/${lifeId}/act`, {
      method: 'POST',
      body: JSON.stringify({ activityId }),
    }),

  succeed: (lifeId: string, heirNpcId: string | null) =>
    request<{ life: LifeView }>(`/lives/${lifeId}/succeed`, {
      method: 'POST',
      body: JSON.stringify({ heirNpcId }),
    }),

  people: (lifeId: string) => request<PeopleView>(`/lives/${lifeId}/people`),
  person: (lifeId: string, npcId: string) => request<PersonView>(`/lives/${lifeId}/people/${npcId}`),

  interact: (lifeId: string, npcId: string, interactionId: string) =>
    request<{ life: LifeView; person: PersonView; warm: boolean; line: string }>(
      `/lives/${lifeId}/people/${npcId}/interact`,
      { method: 'POST', body: JSON.stringify({ interactionId }) },
    ),

  actions: (lifeId: string) => request<{ actions: ActionCard[] }>(`/lives/${lifeId}/actions`),
  prison: (lifeId: string) =>
    request<PrisonView>(`/lives/${lifeId}/prison`).catch(() => null),

  market: (lifeId: string) => request<MarketView>(`/lives/${lifeId}/market`),
  fame: (lifeId: string) => request<FameView>(`/lives/${lifeId}/fame`),
  royal: (lifeId: string) =>
    request<RoyalView>(`/lives/${lifeId}/royal`).catch(() => null),
  mob: (lifeId: string) =>
    request<{
      mob: MobView | null;
      eligibility: { open: boolean; reason: string; visible: boolean };
    }>(`/lives/${lifeId}/mob`),
  mobAct: (lifeId: string, job: string) =>
    request<{ life: LifeView; mob: MobView | null; line: string; cut: string | null }>(
      `/lives/${lifeId}/mob`,
      { method: 'POST', body: JSON.stringify({ job }) },
    ),
  escapeState: (lifeId: string) =>
    request<EscapeView>(`/lives/${lifeId}/escape`).catch(() => null),
  escapeMove: (lifeId: string, move: string) =>
    request<{ life: LifeView; escape: EscapeView | null; line: string }>(
      `/lives/${lifeId}/escape`,
      { method: 'POST', body: JSON.stringify({ move }) },
    ),
  royalAct: (lifeId: string, action: string, choice?: string) =>
    request<{ life: LifeView; royal: RoyalView | null; line: string; respectAfter: number }>(
      `/lives/${lifeId}/royal`,
      { method: 'POST', body: JSON.stringify({ action, choice }) },
    ),
  audition: (lifeId: string, trackId: string) =>
    request<{ life: LifeView }>(`/lives/${lifeId}/audition`, {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    }),

  properties: (lifeId: string) =>
    request<{ properties: PropertyRow[] }>(`/lives/${lifeId}/properties`).then((r) => r.properties),

  amenities: (lifeId: string, assetId: string) =>
    request<{ amenities: AmenityRow[] }>(`/lives/${lifeId}/properties/${assetId}/amenities`).then(
      (r) => r.amenities,
    ),

  manageProperty: (lifeId: string, assetId: string, action: string, amenityId?: string) =>
    request<{ life: LifeView; properties: PropertyRow[] }>(`/lives/${lifeId}/properties/${assetId}`, {
      method: 'POST',
      body: JSON.stringify({ action, amenityId }),
    }),

  trade: (lifeId: string, stockId: string, shares: number, sell: boolean) =>
    request<{ life: LifeView; market: MarketView }>(`/lives/${lifeId}/trade`, {
      method: 'POST',
      body: JSON.stringify({ stockId, shares, sell }),
    }),

  rewindOptions: (lifeId: string) =>
    request<{ options: RewindOption[] }>(`/lives/${lifeId}/rewind`)
      .then((r) => r.options)
      .catch(() => []),

  rewind: (lifeId: string, toAge: number) =>
    request<{ life: LifeView }>(`/lives/${lifeId}/rewind`, {
      method: 'POST',
      body: JSON.stringify({ toAge }),
    }).then((r) => r.life),

  school: (lifeId: string) => request<SchoolView | null>(`/lives/${lifeId}/school`),
  work: (lifeId: string) => request<WorkView | null>(`/lives/${lifeId}/work`),

  openings: (lifeId: string) =>
    request<{ openings: Opening[]; applicationsLeft: number }>(`/lives/${lifeId}/openings`),

  applyFor: (lifeId: string, trackId: string) =>
    request<{ life: LifeView; hired: boolean; line: string }>(`/lives/${lifeId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    }),
  money: (lifeId: string) => request<MoneyView>(`/lives/${lifeId}/money`),

  buy: (lifeId: string, purchasableId: string, onFinance = false) =>
    request<{ life: LifeView; money: MoneyView }>(`/lives/${lifeId}/buy`, {
      method: 'POST',
      body: JSON.stringify({ purchasableId, onFinance }),
    }),

  sell: (lifeId: string, assetId: string) =>
    request<{ life: LifeView; money: MoneyView }>(`/lives/${lifeId}/sell`, {
      method: 'POST',
      body: JSON.stringify({ assetId }),
    }),
  more: (lifeId: string) => request<MoreView>(`/lives/${lifeId}/more`),
  legacy: (lifeId: string) => request<Legacy>(`/lives/${lifeId}/legacy`),
};
