import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, httpApi } from './lib/api';
import { createLocalApi } from './lib/localGame';
import type {
  ActionCard,
  CountryOption,
  LifeView,
  MoneyView,
  MoreView,
  PeopleView,
  PersonView,
  SchoolView,
  WorkView,
} from './lib/api';
import { safeStorage } from './lib/storage';
import { Tabs, type Tab } from './components/Tabs';
import { LifeScreen } from './screens/LifeScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { PersonScreen } from './screens/PersonScreen';
import { DoScreen } from './screens/DoScreen';
import { SchoolScreen } from './screens/SchoolScreen';
import { WorkScreen } from './screens/WorkScreen';
import { MoneyScreen } from './screens/MoneyScreen';
import { MoreScreen } from './screens/MoreScreen';
import { LegacyScreen } from './screens/LegacyScreen';
import { CreateScreen } from './screens/CreateScreen';

const LAST_LIFE = 'onelife.lastLife';

/**
 * VITE_LOCAL builds run the simulation in the browser, so the game can be played
 * from a link with nothing installed. Everything else talks to the server, which
 * is the only version that is actually authoritative.
 */
const api = import.meta.env.VITE_LOCAL === '1' ? createLocalApi() : httpApi;

export const App = () => {
  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [life, setLife] = useState<LifeView | null>(null);
  const [tab, setTab] = useState<Tab>('life');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [people, setPeople] = useState<PeopleView | null>(null);
  const [person, setPerson] = useState<PersonView | null>(null);
  const [actions, setActions] = useState<ActionCard[] | null>(null);
  const [school, setSchool] = useState<SchoolView | null>(null);
  const [work, setWork] = useState<WorkView | null>(null);
  const [money, setMoney] = useState<MoneyView | null>(null);
  const [more, setMore] = useState<MoreView | null>(null);

  // Design 5D: prison recolours the app's chrome.
  useEffect(() => {
    document.documentElement.dataset.chrome = life?.incarcerated ? 'prison' : '';
  }, [life?.incarcerated]);

  const show = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }, []);

  /** Every mutation goes through here, so failure never leaves a stale screen. */
  const run = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      try {
        return await work();
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

      // Resuming is a convenience. If it fails, the player still gets a new life
      // rather than a blank screen.
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
  }, []);

  // Refresh whichever tab is open whenever the life changes underneath it.
  const lifeId = life?.lifeId;
  const stamp = `${life?.revision}:${life?.gameState}`;
  useEffect(() => {
    if (!lifeId) return;
    void (async () => {
      try {
        if (tab === 'people' && !person) setPeople(await api.people(lifeId));
        if (tab === 'do') {
          const [{ actions: list }, enrolled, employed] = await Promise.all([
            api.actions(lifeId),
            api.school(lifeId),
            api.work(lifeId),
          ]);
          setActions(list);
          setSchool(enrolled);
          setWork(employed);
        }
        if (tab === 'money') setMoney(await api.money(lifeId));
        if (tab === 'more') setMore(await api.more(lifeId));
      } catch {
        /* A stale panel is better than a crash; the Life tab stays authoritative. */
      }
    })();
  }, [lifeId, tab, stamp, person]);

  // Age Up is idempotent: a retry after a dropped connection cannot age twice.
  const idempotencyKey = useRef<string>('');
  const onAgeUp = useCallback(async () => {
    if (!life) return;
    idempotencyKey.current = `${life.lifeId}:${life.age}:${Math.random().toString(36).slice(2)}`;
    const result = await run(() => api.ageUp(life.lifeId, idempotencyKey.current));
    if (!result) return;
    setLifeAndRemember(result.life);
    setTab('life');
  }, [life, run, setLifeAndRemember]);

  const onChoose = useCallback(
    async (choiceId: string) => {
      if (!life?.activeEvent) return;
      const result = await run(() => api.choose(life.lifeId, life.activeEvent!.id, choiceId));
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
      // The outcome is the point, so say it rather than leaving the meters to
      // move silently.
      show(result.line);
    },
    [life, person, run, setLifeAndRemember, show],
  );

  const onBuy = useCallback(
    async (purchasableId: string) => {
      if (!life) return;
      const result = await run(() => api.buy(life.lifeId, purchasableId));
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

      // A tap that could not help says so, rather than appearing to do nothing.
      if (result.outcome === 'no_further_effect') {
        show('That has done all it can for you this year.');
      } else if (result.outcome === 'overdone') {
        show('You overdid it.');
      } else if (result.outcome === 'backfired') {
        // The log carries the detail; this is just so it does not pass unnoticed.
        show('That did not go the way you wanted.');
      }
    },
    [life, run, setLifeAndRemember, show],
  );

  const onCreate = useCallback(
    async (input: Parameters<typeof api.newLife>[0]) => {
      const result = await run(() => api.newLife(input));
      if (result) {
        setLifeAndRemember(result.life);
        setTab('life');
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
        setTab('life');
      }
    },
    [life, run, setLifeAndRemember],
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
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // The life is over: the legacy screen takes the whole app until an heir is picked.
  if (!life.canAgeUp && life.gameState === 'LIFE_COMPLETE' && life.legacy) {
    return (
      <div className="app">
        <LegacyScreen legacy={life.legacy} busy={busy} onSucceed={onSucceed} />
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      {tab === 'life' && (
        <LifeScreen
          life={life}
          busy={busy}
          onChoose={onChoose}
          onDismiss={onDismiss}
          onAct={onAct}
          onAgeUp={onAgeUp}
        />
      )}

      {tab === 'people' &&
        (person ? (
          <PersonScreen
            person={person}
            busy={busy}
            decisionOpen={life.activeEvent !== null}
            onBack={() => setPerson(null)}
            onInteract={onInteract}
          />
        ) : people ? (
          <PeopleScreen people={people} onOpen={openPerson} />
        ) : (
          <div className="spinner">…</div>
        ))}

      {/*
        School is the Do tab while you are in it. A separate tab would be dead
        for two thirds of a life, and the design puts school behind Do (3A).
      */}
      {tab === 'do' && school && (
        <SchoolScreen
          school={school}
          busy={busy}
          decisionOpen={life.activeEvent !== null}
          onAct={onAct}
          onOpenPerson={openPerson}
        />
      )}

      {tab === 'do' && !school && work && (
        <WorkScreen
          work={work}
          busy={busy}
          decisionOpen={life.activeEvent !== null}
          onAct={onAct}
          onOpenPerson={openPerson}
        />
      )}

      {tab === 'do' &&
        !school &&
        !work &&
        (actions ? (
          <DoScreen
            actions={actions}
            age={life.age}
            busy={busy}
            decisionOpen={life.activeEvent !== null}
            onAct={onAct}
          />
        ) : (
          <div className="spinner">…</div>
        ))}

      {tab === 'money' &&
        (money ? (
          <MoneyScreen money={money} busy={busy} onBuy={onBuy} onSell={onSell} />
        ) : (
          <div className="spinner">…</div>
        ))}

      {tab === 'more' &&
        (more ? (
          <MoreScreen more={more} generation={life.generation} />
        ) : (
          <div className="spinner">…</div>
        ))}

      <Tabs
        active={tab}
        onChange={(next) => {
          setPerson(null);
          setTab(next);
        }}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};
