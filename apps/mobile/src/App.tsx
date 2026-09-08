import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, httpApi } from './lib/api';
import { createLocalApi } from './lib/localGame';
import type {
  ActionCard,
  CountryOption,
  LifeView,
  AmenityRow,
  MarketView,
  MoneyView,
  PropertyRow,
  FameView,
  RoyalView,
  MobView,
  EscapeView,
  VentureView,
  VentureOffer,
  BlackjackView,
  CasinoView,
  BlackMarketView,
  RacingView,
  VampireView,
  VigilanteView,
  PeopleView,
  PersonView,
  Opening,
  PrisonView,
  RewindOption,
  SchoolView,
  WorkView,
} from './lib/api';
import { safeStorage } from './lib/storage';
import { BottomNav, Header, Sheet, StatsBar, type Slot } from './shell/Frame';
import { LifeLog } from './shell/LifeLog';
import { Popup, ResultToast } from './shell/Popup';
import { PeopleScreen } from './screens/PeopleScreen';
import { PersonScreen } from './screens/PersonScreen';
import { DoScreen, type SpecialRow } from './screens/DoScreen';
import { SchoolScreen } from './screens/SchoolScreen';
import { WorkScreen } from './screens/WorkScreen';
import { JobsScreen } from './screens/JobsScreen';
import { PrisonScreen } from './screens/PrisonScreen';
import { RewindScreen } from './screens/RewindScreen';
import { MoneyScreen } from './screens/MoneyScreen';
import { MarketScreen } from './screens/MarketScreen';
import { PropertyScreen } from './screens/PropertyScreen';
import { FameScreen } from './screens/FameScreen';
import { RoyalScreen } from './screens/RoyalScreen';
import { MobScreen } from './screens/MobScreen';
import { VentureScreen } from './screens/VentureScreen';
import { CasinoScreen } from './screens/CasinoScreen';
import { BlackjackScreen } from './screens/BlackjackScreen';
import { BlackMarketScreen } from './screens/BlackMarketScreen';
import { RacingScreen } from './screens/RacingScreen';
import { VampireScreen } from './screens/VampireScreen';
import { VigilanteScreen } from './screens/VigilanteScreen';
import { EscapeScreen } from './screens/EscapeScreen';
import { LegacyScreen } from './screens/LegacyScreen';
import { CreateScreen } from './screens/CreateScreen';

const LAST_LIFE = 'onelife.lastLife';

/** What the header of each system's own sheet says. */
const SPECIAL_TITLES: Record<string, string> = {
  mob: 'The Family',
  royal: 'The Crown',
  vigilante: 'The Other Life',
  fame: 'Fame',
  casino: 'The Casino',
  blackjack: 'Blackjack',
  blackmarket: 'The Black Market',
  racing: 'Racing',
  vampire: 'Vampire',
};

/** The contextual nav slot names its own sheet, so the two can never disagree. */
const CONTEXT_TITLE = { school: 'School', occupation: 'Occupation', prison: 'Prison' } as const;

/**
 * VITE_LOCAL builds run the simulation in the browser, so the game can be played
 * from a link with nothing installed. Everything else talks to the server, which
 * is the only version that is actually authoritative.
 */
const api = import.meta.env.VITE_LOCAL === '1' ? createLocalApi() : httpApi;

/**
 * The app is one screen: header, log, nav, stats. Tabs are sheets that slide
 * over the log rather than places you go, so the life you are reading is never
 * more than one tap away and the chrome never rearranges itself.
 * See docs/BITLIFE-LOOP-SPEC.md §1.
 */
/** A result message, and optionally the bar it moved. */
interface ToastMeter {
  label: string;
  from: number;
  to: number;
  /** Whether the move was in the player's favour — friction going up is not. */
  good: boolean;
}
interface Toast {
  text: string;
  meter: ToastMeter | null;
}

/**
 * The result of doing something to somebody.
 *
 * The bar is drawn at its value *after* the change, with the old value marked,
 * so the player reads "this is where they are now, and this is how far you
 * moved them" in one glance. A delta on its own would not say whether eight
 * points was most of the way or nothing at all.
 */
const ToastBar = ({ toast }: { toast: Toast }) => (
  <div className="toast">
    <div>{toast.text}</div>
    {toast.meter && (
      <div className="toast-meter">
        <div className="toast-meter-head">
          <span>{toast.meter.label}</span>
          <span className={toast.meter.good ? 'up' : 'down'}>
            {toast.meter.to === toast.meter.from
              ? 'no change'
              : `${toast.meter.to > toast.meter.from ? '+' : ''}${toast.meter.to - toast.meter.from}`}
          </span>
        </div>
        <div className="toast-meter-track">
          <div className="toast-meter-fill" style={{ width: `${toast.meter.to}%` }} />
          <div className="toast-meter-was" style={{ left: `${toast.meter.from}%` }} />
        </div>
      </div>
    )}
  </div>
);

export const App = () => {
  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [life, setLife] = useState<LifeView | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  /*
   * A result the player can see, not only read.
   *
   * BitLife's result for "Compliment her" is the sentence *and* the bar it
   * moved. Ours was the sentence alone, over meters that were behind the toast
   * and had already changed — so the player had no way to tell whether the tap
   * had been worth making. The meter rides along with the message.
   */
  const [toast, setToast] = useState<Toast | null>(null);

  const [people, setPeople] = useState<PeopleView | null>(null);
  const [person, setPerson] = useState<PersonView | null>(null);
  const [actions, setActions] = useState<ActionCard[] | null>(null);
  const [school, setSchool] = useState<SchoolView | null>(null);
  const [work, setWork] = useState<WorkView | null>(null);
  const [jobs, setJobs] = useState<{ openings: Opening[]; applicationsLeft: number } | null>(null);
  const [money, setMoney] = useState<MoneyView | null>(null);
  const [prison, setPrison] = useState<PrisonView | null>(null);
  const [rewinds, setRewinds] = useState<RewindOption[]>([]);
  const [market, setMarket] = useState<MarketView | null>(null);
  const [showMarket, setShowMarket] = useState(false);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [showProperties, setShowProperties] = useState(false);
  const [fame, setFame] = useState<FameView | null>(null);
  /**
   * Which of the systems-with-their-own-screen is open, if any. One field
   * rather than one boolean each: there are seven of them now.
   */
  const [special, setSpecial] = useState<string | null>(null);
  const [casino, setCasino] = useState<CasinoView | null>(null);
  const [table, setTable] = useState<BlackjackView | null>(null);
  const [lastBet, setLastBet] = useState<{
    detail: string;
    line: string;
    netLabel: string;
    won: boolean;
  } | null>(null);
  const [blackMarket, setBlackMarket] = useState<BlackMarketView | null>(null);
  const [racing, setRacing] = useState<RacingView | null>(null);
  const [vampire, setVampire] = useState<VampireView | null>(null);
  const [vigilante, setVigilante] = useState<VigilanteView | null>(null);
  const [royal, setRoyal] = useState<RoyalView | null>(null);
  const [mob, setMob] = useState<MobView | null>(null);
  const [mobOffer, setMobOffer] = useState<{ open: boolean; reason: string; visible: boolean } | null>(
    null,
  );
  const [escape, setEscape] = useState<EscapeView | null>(null);
  const [ventures, setVentures] = useState<VentureView[]>([]);
  const [ventureOffers, setVentureOffers] = useState<VentureOffer[]>([]);
  const [showVentures, setShowVentures] = useState(false);
  const [timeMachine, setTimeMachine] = useState(false);

  // Design 5D: prison recolours the app's chrome.
  useEffect(() => {
    document.documentElement.dataset.chrome = life?.incarcerated ? 'prison' : '';
  }, [life?.incarcerated]);

  const show = useCallback((message: string, meter: ToastMeter | null = null) => {
    setToast({ text: message, meter });
    setTimeout(() => setToast(null), meter ? 3400 : 2600);
  }, []);

  /** Every mutation goes through here, so failure never leaves a stale screen. */
  const run = useCallback(
    async <T,>(job: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      try {
        return await job();
      } catch (error) {
        show(error instanceof ApiError ? error.message : 'Something went wrong.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [show],
  );

  // Boot: load the birthplace list and resume the last life if there is one.
  useEffect(() => {
    void (async () => {
      try {
        const { countries: list } = await api.countries();
        setCountries(list);
      } catch {
        setCountries([]);
        show('Cannot reach the server. Your life is safe — try again in a moment.');
        return;
      }

      try {
        const { lives } = await api.listLives();
        const remembered = safeStorage.get(LAST_LIFE);
        const resume = lives.find((l) => l.id === remembered) ?? lives.find((l) => l.alive);
        if (resume) {
          const { life: loaded } = await api.life(resume.id);
          setLife(loaded);
        }
      } catch {
        /* Nothing to resume. */
      }
    })();
  }, [show]);

  const setLifeAndRemember = useCallback((next: LifeView) => {
    setLife(next);
    safeStorage.set(LAST_LIFE, next.lifeId);
    // Cheap, and it decides whether the header button is there at all.
    void api.rewindOptions(next.lifeId).then(setRewinds);
  }, []);

  // Refresh whichever sheet is open whenever the life changes underneath it.
  const lifeId = life?.lifeId;
  const stamp = `${life?.revision}:${life?.gameState}`;
  useEffect(() => {
    if (!lifeId || !slot) return;
    void (async () => {
      try {
        if (slot === 'relationships' && !person) setPeople(await api.people(lifeId));
        if (slot === 'context') {
          const [enrolled, employed, market, inside, maze] = await Promise.all([
            api.school(lifeId),
            api.work(lifeId),
            api.openings(lifeId),
            api.prison(lifeId),
            api.escapeState(lifeId),
          ]);
          setSchool(enrolled);
          setWork(employed);
          setJobs(market);
          setPrison(inside);
          /*
           * A maze survives closing the app, so it has to survive closing the
           * sheet — it lives in the save because being halfway over a wall is
           * a state, not a screen.
           *
           * Only ever seeds, never clears. This effect refires on every change
           * to the life, including the move that ends the maze, and clearing
           * here wiped the result off the screen the instant the player earned
           * it. Once there is one, the move handler owns it; leaving the sheet
           * is what puts it away.
           */
          setEscape((current) => current ?? (maze && maze.outcome === null ? maze : null));
        }
        if (slot === 'activities') {
          const [rows, known, crown, family, floor, felt, dealers, garage, night, masked] =
            await Promise.all([
              api.actions(lifeId),
              api.fame(lifeId),
              api.royal(lifeId),
              api.mob(lifeId),
              api.casino(lifeId),
              api.blackjack(lifeId),
              api.blackMarket(lifeId),
              api.racing(lifeId),
              api.vampire(lifeId),
              api.vigilante(lifeId),
            ]);
          setActions(rows.actions);
          setFame(known);
          setRoyal(crown);
          setMob(family.mob);
          setMobOffer(family.eligibility);
          setCasino(floor);
          setTable(felt);
          setBlackMarket(dealers);
          setRacing(garage);
          setVampire(night);
          setVigilante(masked);
        }
        if (slot === 'assets') {
          const [worth, board, owned, run] = await Promise.all([
            api.money(lifeId),
            api.market(lifeId),
            api.properties(lifeId),
            api.ventures(lifeId),
          ]);
          setMoney(worth);
          setMarket(board);
          setProperties(owned);
          setVentures(run.ventures);
          setVentureOffers(run.offers);
        }
      } catch {
        /* A stale sheet is better than a crash; the log stays authoritative. */
      }
    })();
  }, [lifeId, slot, stamp, person]);

  // Age Up is idempotent: a retry after a dropped connection cannot age twice.
  const idempotencyKey = useRef<string>('');
  const onAgeUp = useCallback(async () => {
    if (!life) return;
    idempotencyKey.current = `${life.lifeId}:${life.age}:${Math.random().toString(36).slice(2)}`;
    const result = await run(() => api.ageUp(life.lifeId, idempotencyKey.current));
    if (!result) return;
    setLifeAndRemember(result.life);
    // Ageing up is a return to the log, whatever sheet was open.
    setSlot(null);
    setPerson(null);
  }, [life, run, setLifeAndRemember]);

  const onChoose = useCallback(
    async (choiceId: string, selections: Record<string, string>) => {
      if (!life?.activeEvent) return;
      const result = await run(() =>
        api.choose(life.lifeId, life.activeEvent!.id, choiceId, selections),
      );
      if (result) setLifeAndRemember(result.life);
    },
    [life, run, setLifeAndRemember],
  );

  const onDismiss = useCallback(async () => {
    if (!life) return;
    const result = await run(() => api.dismiss(life.lifeId));
    if (result) setLifeAndRemember(result.life);
  }, [life, run, setLifeAndRemember]);

  const onInteract = useCallback(
    async (interactionId: string) => {
      if (!life || !person) return;
      const result = await run(() => api.interact(life.lifeId, person.npcId, interactionId));
      if (!result) return;
      setLifeAndRemember(result.life);
      setPerson(result.person);
      show(result.line, result.meter);
    },
    [life, person, run, setLifeAndRemember, show],
  );

  const onApply = useCallback(
    async (trackId: string) => {
      if (!life) return;
      const result = await run(() => api.applyFor(life.lifeId, trackId));
      if (!result) return;
      setLifeAndRemember(result.life);
      show(result.line);
    },
    [life, run, setLifeAndRemember, show],
  );

  const onBuy = useCallback(
    async (purchasableId: string, onFinance: boolean) => {
      if (!life) return;
      const result = await run(() => api.buy(life.lifeId, purchasableId, onFinance));
      if (!result) return;
      setLifeAndRemember(result.life);
      setMoney(result.money);
    },
    [life, run, setLifeAndRemember],
  );

  const onSell = useCallback(
    async (assetId: string) => {
      if (!life) return;
      const result = await run(() => api.sell(life.lifeId, assetId));
      if (!result) return;
      setLifeAndRemember(result.life);
      setMoney(result.money);
    },
    [life, run, setLifeAndRemember],
  );

  const onAct = useCallback(
    async (activityId: string) => {
      if (!life) return;
      const result = await run(() => api.act(life.lifeId, activityId));
      if (!result) return;
      setLifeAndRemember(result.life);

      if (result.outcome === 'no_further_effect') {
        show('That has done all it can for you this year.');
      } else if (result.outcome === 'overdone') {
        show('You overdid it.');
      } else if (result.outcome === 'backfired') {
        show('That did not go the way you wanted.');
      } else if (result.line) {
        // Most activities are a stat change and the log line is the whole
        // result. The ones that resolve something say so where you tapped.
        show(result.line);
      }
    },
    [life, run, setLifeAndRemember, show],
  );

  const onCreate = useCallback(
    async (input: Parameters<typeof api.newLife>[0]) => {
      const result = await run(() => api.newLife(input));
      if (result) {
        setLifeAndRemember(result.life);
        setSlot(null);
      }
    },
    [run, setLifeAndRemember],
  );

  const onSucceed = useCallback(
    async (heirNpcId: string | null) => {
      if (!life) return;
      const result = await run(() => api.succeed(life.lifeId, heirNpcId));
      if (result) {
        setLifeAndRemember(result.life);
        setPeople(null);
        setPerson(null);
        setSlot(null);
      }
    },
    [life, run, setLifeAndRemember],
  );

  const onTrade = useCallback(
    async (stockId: string, shares: number, sell: boolean) => {
      if (!life) return;
      const result = await run(() => api.trade(life.lifeId, stockId, shares, sell));
      if (!result) return;
      setLifeAndRemember(result.life);
      setMarket(result.market);
      // The money screen's figures move too, and it is one tap away.
      void api.money(life.lifeId).then(setMoney);
    },
    [life, run, setLifeAndRemember],
  );

  const onManageProperty = useCallback(
    async (assetId: string, action: string, amenityId?: string) => {
      if (!life) return;
      const result = await run(() => api.manageProperty(life.lifeId, assetId, action, amenityId));
      if (!result) return;
      setLifeAndRemember(result.life);
      setProperties(result.properties);
      // Letting somewhere raises the applicant popup, which lives over the sheet.
      if (result.life.activeEvent) setSlot(null);
      void api.money(life.lifeId).then(setMoney);
    },
    [life, run, setLifeAndRemember],
  );

  const onAudition = useCallback(
    async (trackId: string) => {
      if (!life) return;
      const result = await run(() => api.audition(life.lifeId, trackId));
      if (!result) return;
      setLifeAndRemember(result.life);
      // The audition itself is a popup; get out of its way.
      setSpecial(null);
      setSlot(null);
    },
    [life, run, setLifeAndRemember],
  );

  const onRoyalAct = useCallback(
    async (action: string) => {
      if (!life) return;
      const result = await run(() => api.royalAct(life.lifeId, action));
      if (!result) return;
      setLifeAndRemember(result.life);
      setRoyal(result.royal);
      // Abdication and a revolt both end the screen you are standing on.
      if (!result.royal) setSpecial(null);
      setToast({ text: result.line, meter: null });
    },
    [life, run, setLifeAndRemember],
  );

  /**
   * One row, two meanings: it joins when you are not in and opens the screen
   * when you are. Which is roughly how it works — there is no application, only
   * somebody deciding you are worth asking.
   */
  const onOpenMob = useCallback(async () => {
    if (!life) return;
    if (mob) {
      setSpecial('mob');
      return;
    }
    const result = await run(() => api.mobAct(life.lifeId, 'join'));
    if (!result) return;
    setLifeAndRemember(result.life);
    setMob(result.mob);
    setSpecial('mob');
  }, [life, mob, run, setLifeAndRemember]);

  const onMobJob = useCallback(
    async (job: string) => {
      if (!life) return;
      const result = await run(() => api.mobAct(life.lifeId, job));
      if (!result) return;
      setLifeAndRemember(result.life);
      setMob(result.mob);
      // A charge raises the lawyer popup, which lives over the sheet.
      if (result.life.activeEvent) {
        setSpecial(null);
        setSlot(null);
      }
      if (result.line) {
        setToast({
          text: result.cut ? `${result.line} ${result.cut}.` : result.line,
          meter: null,
        });
      }
    },
    [life, run, setLifeAndRemember],
  );

  /**
   * The rows at the top of Activities, and what each one says about itself.
   *
   * A row appears when there is something behind it worth opening — the mob
   * shows once there is a record, the crown only when there is a title — so the
   * list is also how a player discovers these exist.
   */
  const specials: SpecialRow[] = [
    mob
      ? { id: 'mob', icon: '🕴️', label: 'The Family', note: `${mob.title}, ${mob.family}`, locked: null }
      : mobOffer?.visible
        ? {
            id: 'mob',
            icon: '🕴️',
            label: 'The Family',
            note: mobOffer.open ? 'Somebody has been asking about you' : mobOffer.reason,
            locked: mobOffer.open ? null : mobOffer.reason,
          }
        : null,
    royal
      ? {
          id: 'royal',
          icon: '👑',
          label: 'The Crown',
          note: `${royal.title} · ${royal.respectWord.toLowerCase()}`,
          locked: null,
        }
      : null,
    fame && life && life.age >= 10
      ? { id: 'fame', icon: '🌟', label: 'Fame', note: fame.line, locked: null }
      : null,
    casino
      ? {
          id: 'casino',
          icon: '🎰',
          label: 'The Casino',
          note: casino.locked ?? `${casino.betsLeft} goes left this year`,
          locked: casino.locked,
        }
      : null,
    table
      ? {
          id: 'blackjack',
          icon: '🃏',
          label: 'Blackjack',
          note: table.hand && !table.hand.settled
            ? `A hand on the table for ${table.hand.stake}`
            : table.locked ?? 'Two cards, a dealer, and a decision',
          locked: table.hand && !table.hand.settled ? null : table.locked,
        }
      : null,
    blackMarket
      ? {
          id: 'blackmarket',
          icon: '🕶️',
          label: 'The Black Market',
          note:
            blackMarket.holdings.length > 0
              ? `${blackMarket.holdings.length} in the house · ${blackMarket.heatWord.toLowerCase()}`
              : 'Six people who will sell you something',
          locked: blackMarket.locked,
        }
      : null,
    racing
      ? {
          id: 'racing',
          icon: '🏁',
          label: 'Racing',
          note: racing.garage
            ? `${racing.raceClass} · ${racing.cars.length} in the garage`
            : 'A unit with a roller door, and everything after it',
          locked: racing.locked,
        }
      : null,
    vigilante
      ? {
          id: 'vigilante',
          icon: '🌃',
          label: vigilante.active ? vigilante.alias : 'The other life',
          note: vigilante.unmasked && !vigilante.active
            ? `Everybody knows you were ${vigilante.alias}`
            : vigilante.active
              ? `${vigilante.standingWord.toLowerCase()} · ${vigilante.suspicionWord.toLowerCase()}`
              : 'Go out at night and do something about it',
          locked: null,
        }
      : null,
    vampire
      ? {
          id: 'vampire',
          icon: '🧛',
          label: vampire.lord ? 'Vampire Lord' : vampire.turned ? 'Vampire' : 'Something in this town',
          note: vampire.turned
            ? `${vampire.essence} essence · ${vampire.notorietyWord.toLowerCase()}`
            : 'Somebody here has been here a very long time',
          locked: null,
        }
      : null,
  ].filter((row): row is SpecialRow => row !== null);

  const onOpenSpecial = useCallback(
    async (id: string) => {
      if (id === 'mob' && !mob) {
        void onOpenMob();
        return;
      }
      setSpecial(id);
    },
    [mob, onOpenMob],
  );

  const onVigilante = useCallback(
    async (action: string, gearId?: string) => {
      if (!life) return;
      const result = await run(() => api.vigilanteAct(life.lifeId, action, gearId));
      if (!result) return;
      setLifeAndRemember(result.life);
      setVigilante(result.vigilante);
      // Going out raises the incident, which lives over the sheet.
      if (result.life.activeEvent) {
        setSpecial(null);
        setSlot(null);
      }
    },
    [life, run, setLifeAndRemember],
  );

  const onBet = useCallback(
    async (which: string, stake: number, pick: string) => {
      if (!life) return;
      const result = await run(() => api.bet(life.lifeId, which, stake, pick));
      if (!result) return;
      setLifeAndRemember(result.life);
      setCasino(result.casino);
      setLastBet({
        detail: result.detail,
        line: result.line,
        netLabel: result.netLabel,
        won: result.won,
      });
    },
    [life, run, setLifeAndRemember],
  );

  const onTable = useCallback(
    async (action: 'deal' | 'hit' | 'stand' | 'double', stake?: number) => {
      if (!life) return;
      const result = await run(() => api.blackjackAct(life.lifeId, { action, stake }));
      if (!result) return;
      setLifeAndRemember(result.life);
      setTable(result.table);
    },
    [life, run, setLifeAndRemember],
  );

  const onDeal = useCallback(
    async (body: { action: 'buy' | 'haggle' | 'fence'; dealerId?: string; itemId?: string; assetId?: string }) => {
      if (!life) return;
      const result = await run(() => api.deal(life.lifeId, body));
      if (!result) return;
      setLifeAndRemember(result.life);
      setBlackMarket(result.market);
      if (result.line) setToast({ text: result.line, meter: null });
    },
    [life, run, setLifeAndRemember],
  );

  const onRacing = useCallback(
    async (body: { action: 'garage' | 'car' | 'mod' | 'race'; carId?: string; assetId?: string; modId?: string; style?: string }) => {
      if (!life) return;
      const result = await run(() => api.racingAct(life.lifeId, body));
      if (!result) return;
      setLifeAndRemember(result.life);
      setRacing(result.racing);
      if (result.line) setToast({ text: result.line, meter: null });
    },
    [life, run, setLifeAndRemember],
  );

  const onVampire = useCallback(
    async (action: string) => {
      if (!life) return;
      const result = await run(() => api.vampireAct(life.lifeId, action));
      if (!result) return;
      setLifeAndRemember(result.life);
      setVampire(result.vampire);
      if (result.line) setToast({ text: result.line, meter: null });
    },
    [life, run, setLifeAndRemember],
  );

  const onVenture = useCallback(
    async (body: {
      action: 'start' | 'act' | 'upgrade';
      kind?: string;
      tierId?: string;
      ventureId?: string;
      id?: string;
    }) => {
      if (!life) return;
      const result = await run(() => api.venture(life.lifeId, body));
      if (!result) return;
      setLifeAndRemember(result.life);
      setVentures(result.ventures);
      setVentureOffers(result.offers);
      // A charge raises the lawyer popup, which lives over the sheet.
      if (result.life.activeEvent) {
        setShowVentures(false);
        setSlot(null);
      }
      if (result.line) setToast({ text: result.line, meter: null });
      void api.money(life.lifeId).then(setMoney);
    },
    [life, run, setLifeAndRemember],
  );

  const onEscapeMove = useCallback(
    async (move: string) => {
      if (!life) return;
      const result = await run(() => api.escapeMove(life.lifeId, move));
      if (!result) return;
      setLifeAndRemember(result.life);
      setEscape(result.escape);
      if (result.line) setToast({ text: result.line, meter: null });
    },
    [life, run, setLifeAndRemember],
  );

  const loadAmenities = useCallback(
    async (assetId: string): Promise<AmenityRow[]> =>
      life ? await api.amenities(life.lifeId, assetId) : [],
    [life],
  );

  const onRewind = useCallback(
    async (toAge: number) => {
      if (!life) return;
      const restored = await run(() => api.rewind(life.lifeId, toAge));
      if (!restored) return;
      setLifeAndRemember(restored);
      setTimeMachine(false);
      setSlot(null);
      setPerson(null);
      show(`You are ${toAge} again.`);
    },
    [life, run, setLifeAndRemember, show],
  );

  const openPerson = useCallback(
    async (npcId: string) => {
      if (!life) return;
      const result = await run(() => api.person(life.lifeId, npcId));
      if (result) setPerson(result);
    },
    [life, run],
  );

  if (!countries) {
    return (
      <div className="app">
        <div className="spinner">…</div>
      </div>
    );
  }

  if (!life) {
    return (
      <div className="app">
        <CreateScreen countries={countries} busy={busy} onCreate={onCreate} />
        {toast && <ToastBar toast={toast} />}
      </div>
    );
  }

  // The life is over: the legacy screen takes the whole app until an heir is picked.
  if (!life.canAgeUp && life.gameState === 'LIFE_COMPLETE' && life.legacy) {
    return (
      <div className="app">
        <LegacyScreen legacy={life.legacy} busy={busy} onSucceed={onSucceed} />
        {toast && <ToastBar toast={toast} />}
      </div>
    );
  }

  const decisionOpen = life.activeEvent !== null;

  return (
    <div className="app">
      <Header
        life={life}
        canRewind={rewinds.length > 0}
        onRewind={() => setTimeMachine(true)}
      />

      <main className="sh-main">
        <LifeLog life={life} />

        {slot === 'relationships' &&
          (person ? (
            <Sheet title={person.name} onBack={() => setPerson(null)} onClose={() => setSlot(null)}>
              <PersonScreen
                person={person}
                busy={busy}
                decisionOpen={decisionOpen}
                onBack={() => setPerson(null)}
                onInteract={onInteract}
              />
            </Sheet>
          ) : (
            <Sheet title="Relationships" onClose={() => setSlot(null)}>
              {people ? <PeopleScreen people={people} onOpen={openPerson} /> : <div className="spinner">…</div>}
            </Sheet>
          ))}

        {/*
          One contextual slot, and what it holds is decided by the same rule
          that labels it: school while you are in it, work when you are not,
          prison over everything. The player never has to hunt for the screen
          that matters right now.
        */}
        {slot === 'context' && escape && (
          <Sheet
            title="Over the wall"
            onBack={() => setEscape(null)}
            onClose={() => {
              setEscape(null);
              setSlot(null);
            }}
          >
            <EscapeScreen escape={escape} busy={busy} onMove={onEscapeMove} />
          </Sheet>
        )}

        {slot === 'context' && !escape && (
          <Sheet title={CONTEXT_TITLE[life.navSlot]} onClose={() => setSlot(null)}>
            {life.navSlot === 'school' && school && (
              <SchoolScreen
                school={school}
                busy={busy}
                decisionOpen={decisionOpen}
                onAct={onAct}
                onOpenPerson={openPerson}
              />
            )}
            {life.navSlot === 'school' && !school && (
              <p className="sh-empty">You are not enrolled anywhere yet.</p>
            )}
            {life.navSlot === 'occupation' && work && (
              <WorkScreen
                work={work}
                busy={busy}
                decisionOpen={decisionOpen}
                onAct={onAct}
                onOpenPerson={openPerson}
              />
            )}
            {life.navSlot === 'occupation' && !work && jobs && (
              <JobsScreen
                openings={jobs.openings}
                applicationsLeft={jobs.applicationsLeft}
                busy={busy}
                decisionOpen={decisionOpen}
                onApply={onApply}
              />
            )}
            {life.navSlot === 'occupation' && !work && !jobs && <div className="spinner">…</div>}
            {life.navSlot === 'prison' &&
              (prison ? (
                <PrisonScreen
                  prison={prison}
                  busy={busy}
                  decisionOpen={decisionOpen}
                  onAct={onAct}
                  onEscape={() => void onEscapeMove('start')}
                />
              ) : (
                <div className="spinner">…</div>
              ))}
          </Sheet>
        )}

        {/*
          One sheet per system, chosen by name. This started as a boolean per
          screen and a chain of ternaries, which was already unreadable at three
          and does not survive seven.
        */}
        {slot === 'activities' && special !== null && (
          <Sheet
            title={SPECIAL_TITLES[special] ?? 'Yours'}
            onBack={() => setSpecial(null)}
            onClose={() => {
              setSpecial(null);
              setSlot(null);
            }}
          >
            {special === 'mob' && mob && (
              <MobScreen mob={mob} busy={busy} decisionOpen={decisionOpen} onJob={onMobJob} />
            )}
            {special === 'royal' && royal && (
              <RoyalScreen
                royal={royal}
                busy={busy}
                decisionOpen={decisionOpen}
                onAct={onRoyalAct}
              />
            )}
            {special === 'fame' && fame && (
              <FameScreen
                fame={fame}
                busy={busy}
                decisionOpen={decisionOpen}
                onAudition={onAudition}
              />
            )}
            {special === 'casino' && casino && (
              <CasinoScreen casino={casino} busy={busy} last={lastBet} onBet={onBet} />
            )}
            {special === 'blackjack' && table && (
              <BlackjackScreen
                table={table}
                busy={busy}
                onDeal={(stake) => onTable('deal', stake)}
                onHit={() => onTable('hit')}
                onStand={() => onTable('stand')}
                onDouble={() => onTable('double')}
              />
            )}
            {special === 'blackmarket' && blackMarket && (
              <BlackMarketScreen market={blackMarket} busy={busy} onDeal={onDeal} />
            )}
            {special === 'racing' && racing && (
              <RacingScreen racing={racing} busy={busy} onAct={onRacing} />
            )}
            {special === 'vigilante' && vigilante && (
              <VigilanteScreen
                vigilante={vigilante}
                busy={busy}
                decisionOpen={decisionOpen}
                onAct={onVigilante}
              />
            )}
            {special === 'vampire' && vampire && (
              <VampireScreen vampire={vampire} busy={busy} onAct={onVampire} />
            )}
          </Sheet>
        )}

        {slot === 'activities' && special === null && (
          <Sheet title="Activities" onClose={() => setSlot(null)}>
            {actions ? (
              <DoScreen
                actions={actions}
                age={life.age}
                busy={busy}
                decisionOpen={decisionOpen}
                onAct={onAct}
                specials={specials}
                onSpecial={onOpenSpecial}
              />
            ) : (
              <div className="spinner">…</div>
            )}
          </Sheet>
        )}

        {timeMachine && (
          <Sheet title="Time Machine" onClose={() => setTimeMachine(false)}>
            <RewindScreen options={rewinds} busy={busy} onRewind={onRewind} />
          </Sheet>
        )}

        {slot === 'assets' && showProperties && (
          <Sheet
            title="Property"
            onBack={() => setShowProperties(false)}
            onClose={() => {
              setShowProperties(false);
              setSlot(null);
            }}
          >
            <PropertyScreen
              properties={properties}
              busy={busy}
              loadAmenities={loadAmenities}
              onManage={onManageProperty}
            />
          </Sheet>
        )}

        {slot === 'assets' && !showProperties && showVentures && (
          <Sheet
            title="Ventures"
            onBack={() => setShowVentures(false)}
            onClose={() => {
              setShowVentures(false);
              setSlot(null);
            }}
          >
            <VentureScreen
              ventures={ventures}
              offers={ventureOffers}
              busy={busy}
              decisionOpen={decisionOpen}
              onStart={(kind, tierId) => void onVenture({ action: 'start', kind, tierId })}
              onAct={(ventureId, id) => void onVenture({ action: 'act', ventureId, id })}
              onUpgrade={(ventureId, id) => void onVenture({ action: 'upgrade', ventureId, id })}
            />
          </Sheet>
        )}

        {slot === 'assets' &&
          !showProperties &&
          !showVentures &&
          (showMarket ? (
            <Sheet
              title="Stock Market"
              onBack={() => setShowMarket(false)}
              onClose={() => {
                setShowMarket(false);
                setSlot(null);
              }}
            >
              {market ? (
                <MarketScreen market={market} busy={busy} onTrade={onTrade} />
              ) : (
                <div className="spinner">…</div>
              )}
            </Sheet>
          ) : (
            <Sheet title="Assets" onClose={() => setSlot(null)}>
              {money ? (
                <MoneyScreen
                  money={money}
                  market={market}
                  busy={busy}
                  onBuy={onBuy}
                  onSell={onSell}
                  onOpenMarket={() => setShowMarket(true)}
                  properties={properties}
                  onOpenProperties={() => setShowProperties(true)}
                  ventures={ventures}
                  onOpenVentures={() => setShowVentures(true)}
                />
              ) : (
                <div className="spinner">…</div>
              )}
            </Sheet>
          ))}
      </main>

      <BottomNav
        life={life}
        open={slot}
        busy={busy}
        onOpen={(next) => {
          setPerson(null);
          setSlot(next);
        }}
        onAgeUp={onAgeUp}
      />
      <StatsBar life={life} />

      {life.activeEvent && <Popup event={life.activeEvent} busy={busy} onChoose={onChoose} />}
      {!life.activeEvent && life.resolvedEvent && (
        <ResultToast event={life.resolvedEvent} onDismiss={onDismiss} />
      )}

      {toast && <ToastBar toast={toast} />}
    </div>
  );
};
