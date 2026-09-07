import { useEffect, useMemo, useRef } from 'react';
import type { LifeView } from '../lib/api';
import { EventCard, ResultCard } from '../components/EventCard';

/**
 * The life screen is the life.
 *
 * It is one continuous log from birth to now, oldest at the top, and ageing up
 * appends to the bottom — the genre's central gesture, and the reason a life
 * feels like it accumulated rather than refreshed. An earlier version showed
 * only the current year under "Earlier this year", which meant everything that
 * had ever happened to the character was unreachable.
 *
 * The identity header (design 1A) stays pinned above it, so who you are and how
 * you're doing never scrolls away.
 */
export const LifeScreen = ({
  life,
  busy,
  onChoose,
  onDismiss,
  onAgeUp,
}: {
  life: LifeView;
  busy: boolean;
  onChoose: (choiceId: string) => void;
  onDismiss: () => void;
  onAgeUp: () => void;
}) => {
  /**
   * Group the flat log into years, newest first.
   *
   * The log arrives oldest-first because that is how a life is lived, but the
   * screen reads the other way round: what just happened is what you came to
   * see, and childhood is something you scroll back to.
   */
  const years = useMemo(() => {
    const out: { age: number; entries: LifeView['log'] }[] = [];
    for (const entry of life.log) {
      const last = out[out.length - 1];
      if (last && last.age === entry.atAge) last.entries.push(entry);
      else out.push({ age: entry.atAge, entries: [entry] });
    }
    return out.reverse();
  }, [life.log]);

  /*
   * Back to the top on every age-up. The newest year is rendered first, so
   * "the top" is where the year that just happened is.
   */
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [life.age]);

  return (
    <>
      <header className="header">
        <div className="identity">
          <div style={{ minWidth: 0 }}>
            <div className="date-line">{life.dateLine}</div>
            <h1 className="name">{life.name}</h1>
            <div className="identity-sub">{life.subtitle}</div>
          </div>
          <div className="avatar">{life.avatarEmoji}</div>
        </div>

        <div className="stat-row">
          {life.stats.map((stat) => (
            <div className="stat" key={stat.key} title={stat.label}>
              <div className="stat-icon">{stat.icon}</div>
              <div className="stat-track">
                <div
                  className="stat-fill"
                  style={{ width: `${stat.value}%`, background: stat.color }}
                />
              </div>
              <div className="stat-value">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="job-strip">
          <span>💼 {life.jobLine}</span>
          <span className="money">{life.money}</span>
        </div>
      </header>

      <div className="scroll log" ref={scroller}>
        {/* What is happening now, above the record of what already did. */}
        {life.activeEvent && (
          <EventCard event={life.activeEvent} onChoose={onChoose} busy={busy} />
        )}
        {life.resolvedEvent && <ResultCard event={life.resolvedEvent} onDismiss={onDismiss} />}

        {years.map((year) => (
          <section className="log-year" key={year.age}>
            <div className="log-age">
              <span>Age {year.age}</span>
              <span className="log-rule" />
            </div>
            {year.entries.map((entry, index) => (
              <div className={`log-row${entry.major ? ' major' : ''}`} key={index}>
                <span className="log-icon">{entry.icon}</span>
                <span className="log-text">{entry.text}</span>
              </div>
            ))}
          </section>
        ))}

      </div>

      <div className="footer">
        <button
          className={`age-up${life.canAgeUp ? '' : ' blocked'}`}
          disabled={!life.canAgeUp || busy}
          onClick={onAgeUp}
        >
          {busy ? '…' : life.ageUpLabel}
        </button>
      </div>
    </>
  );
};
