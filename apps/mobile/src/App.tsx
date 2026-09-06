import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './lib/api';
import type {
  ActionCard,
  CountryOption,
  LifeView,
  MoneyView,
  MoreView,
  PeopleView,
  PersonView,
  Recap,
} from './lib/api';
import { Tabs, type Tab } from './components/Tabs';
import { LifeScreen } from './screens/LifeScreen';
import { RecapScreen } from './screens/RecapScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { PersonScreen } from './screens/PersonScreen';
import { DoScreen } from './screens/DoScreen';
import { MoneyScreen } from './screens/MoneyScreen';
import { MoreScreen } from './screens/MoreScreen';
import { LegacyScreen } from './screens/LegacyScreen';
import { CreateScreen } from './screens/CreateScreen';

const LAST_LIFE = 'onelife.lastLife';

export const App = () => {
  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [life, setLife] = useState<LifeView | null>(null);
  const [tab, setTab] = useState<Tab>('life');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [recap, setRecap] = useState<Recap | null>(null);
  const [people, setPeople] = useState<PeopleView | null>(null);
  const [person, setPerson] = useState<PersonView | null>(null);
  const [actions, setActions] = useState<{ actions: ActionCard[]; remaining: number } | null>(null);
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
        const [{ countries: list }, { lives }] = await Promise.all([
          api.countries(),
          api.listLives(),
        ]);
        setCountries(list);

        const remembered = localStorage.getItem(LAST_LIFE);
        const resume = lives.find((l) => l.id === remembered) ?? lives.find((l) => l.alive);
        if (resume) {
          const { life: loaded } = await api.life(resume.id);
          setLife(loaded);
        }
      } catch {
        setCountries([]);
        show('Cannot reach the server. Your life is safe — try again in a moment.');
      }
    })();
  }, [show]);

  const setLifeAndRemember = useCallback((next: LifeView) => {
    setLife(next);
    localStorage.setItem(LAST_LIFE, next.lifeId);
  }, []);

  // Refresh whichever tab is open whenever the life changes underneath it.
  const lifeId = life?.lifeId;
  const stamp = `${life?.age}:${life?.gameState}:${life?.actionsRemaining}`;
  useEffect(() => {
    if (!lifeId) return;
    void (async () => {
      try {
        if (tab === 'people' && !person) setPeople(await api.people(lifeId));
        if (tab === 'do') setActions(await api.actions(lifeId));
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
    setRecap(result.recap);
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

  const onAct = useCallback(
    async (activityId: string) => {
      if (!life) return;
      const result = await run(() => api.act(life.lifeId, activityId));
      if (result) setLifeAndRemember(result.life);
    },
    [life, run, setLifeAndRemember],
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
        setRecap(null);
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
          <PersonScreen person={person} onBack={() => setPerson(null)} />
        ) : people ? (
          <PeopleScreen people={people} onOpen={openPerson} />
        ) : (
          <div className="spinner">…</div>
        ))}

      {tab === 'do' &&
        (actions ? (
          <DoScreen
            actions={actions.actions}
            remaining={actions.remaining}
            age={life.age}
            busy={busy}
            onAct={onAct}
          />
        ) : (
          <div className="spinner">…</div>
        ))}

      {tab === 'money' && (money ? <MoneyScreen money={money} /> : <div className="spinner">…</div>)}

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

      {recap && (
        <RecapScreen
          recap={recap}
          dateLine={life.dateLine}
          cityName={life.subtitle.split(' · ')[1] ?? ''}
          onContinue={() => setRecap(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};
