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
}

export interface ActiveEvent {
  id: string;
  definitionId: string;
  card: { icon: string; label: string; tint: string; color: string };
  title: string;
  body: string;
  choices: EventChoice[];
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
  stats: StatBar[];
  jobLine: string;
  money: string;
  gameState: string;
  activeEvent: ActiveEvent | null;
  resolvedEvent: ActiveEvent | null;
  log: Array<{ atAge: number; icon: string; text: string; major: boolean }>;
  quickActions: ActionCard[];
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
  choose(lifeId: string, eventId: string, choiceId: string): Promise<{ life: LifeView }>;
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
  /** Null when the character has no job. */
  work(lifeId: string): Promise<WorkView | null>;
  openings(lifeId: string): Promise<{ openings: Opening[]; applicationsLeft: number }>;
  applyFor(lifeId: string, trackId: string): Promise<{ life: LifeView; hired: boolean; line: string }>;
  money(lifeId: string): Promise<MoneyView>;
  buy(lifeId: string, purchasableId: string): Promise<{ life: LifeView; money: MoneyView }>;
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

  choose: (lifeId: string, eventId: string, choiceId: string) =>
    request<{ life: LifeView }>(`/lives/${lifeId}/events/${eventId}/choose`, {
      method: 'POST',
      body: JSON.stringify({ choiceId }),
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

  buy: (lifeId: string, purchasableId: string) =>
    request<{ life: LifeView; money: MoneyView }>(`/lives/${lifeId}/buy`, {
      method: 'POST',
      body: JSON.stringify({ purchasableId }),
    }),

  sell: (lifeId: string, assetId: string) =>
    request<{ life: LifeView; money: MoneyView }>(`/lives/${lifeId}/sell`, {
      method: 'POST',
      body: JSON.stringify({ assetId }),
    }),
  more: (lifeId: string) => request<MoreView>(`/lives/${lifeId}/more`),
  legacy: (lifeId: string) => request<Legacy>(`/lives/${lifeId}/legacy`),
};
