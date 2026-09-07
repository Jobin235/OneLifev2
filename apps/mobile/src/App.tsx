import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, httpApi } from './lib/api';
import { createLocalApi } from './lib/localGame';
import type {
  ActionCard,
  CountryOption,
  LifeView,
  MoneyView,
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
import { DoScreen } from './screens/DoScreen';
import { SchoolScreen } from './screens/SchoolScreen';
import { WorkScreen } from './screens/WorkScreen';
import { JobsScreen } from './screens/JobsScreen';
import { PrisonScreen } from './screens/PrisonScreen';
import { RewindScreen } from './screens/RewindScreen';
import { MoneyScreen } from './screens/MoneyScreen';
import { LegacyScreen } from './screens/LegacyScreen';
import { CreateScreen } from './screens/CreateScreen';

const LAST_LIFE = 'onelife.lastLife';

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
export const App = () => {
  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [life, setLife] = useState<LifeView | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [people, setPeople] = useState<PeopleView | null>(null);
  const [person, setPerson] = useState<PersonView | null>(null);
  const [actions, setActions] = useState<ActionCard[] | null>(null);
  const [school, setSchool] = useState<SchoolView | null>(null);
  const [work, setWork] = useState<WorkView | null>(null);
  const [jobs, setJobs] = useState<{ openings: Opening[]; applicationsLeft: number } | null>(null);
  const [money, setMoney] = useState<MoneyView | null>(null);
  const [prison, setPrison] = useState<PrisonView | null>(null);
  const [rewinds, setRewinds] = useState<RewindOption[]>([]);
  const [timeMachine, setTimeMachine] = useState(false);

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
          const [enrolled, employed, market, inside] = await Promise.all([
            api.school(lifeId),
            api.work(lifeId),
            api.openings(lifeId),
            api.prison(lifeId),
          ]);
          setSchool(enrolled);
          setWork(employed);
          setJobs(market);
          setPrison(inside);
        }
        if (slot === 'activities') setActions((await api.actions(lifeId)).actions);
        if (slot === 'assets') setMoney(await api.money(lifeId));
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
      show(result.line);
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
        {slot === 'context' && (
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
                />
              ) : (
                <div className="spinner">…</div>
              ))}
          </Sheet>
        )}

        {slot === 'activities' && (
          <Sheet title="Activities" onClose={() => setSlot(null)}>
            {actions ? (
              <DoScreen
                actions={actions}
                age={life.age}
                busy={busy}
                decisionOpen={decisionOpen}
                onAct={onAct}
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

        {slot === 'assets' && (
          <Sheet title="Assets" onClose={() => setSlot(null)}>
            {money ? (
              <MoneyScreen money={money} busy={busy} onBuy={onBuy} onSell={onSell} />
            ) : (
              <div className="spinner">…</div>
            )}
          </Sheet>
        )}
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};
