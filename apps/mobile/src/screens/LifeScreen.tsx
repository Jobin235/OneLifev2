import { useEffect, useMemo, useRef } from 'react';
import type { ActionCard, LifeView } from '../lib/api';
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
  onAct,
  onAgeUp,
}: {
  life: LifeView;
  busy: boolean;
  onChoose: (choiceId: string) => void;
  onDismiss: () => void;
  onAct: (activityId: string) => void;
  onAgeUp: () => void;
}) => {
  const idle = !life.activeEvent && !life.resolvedEvent;

  /** Group the flat log into years, so each age is a labelled run of lines. */
  const years = useMemo(() => {
    const out: { age: number; entries: LifeView['log'] }[] = [];
    for (const entry of life.log) {
      const last = out[out.length - 1];
      if (last && last.age === entry.atAge) last.entries.push(entry);
      else out.push({ age: entry.atAge, entries: [entry] });
    }
    return out;
  }, [life.log]);

  /*
   * Keep the newest year in view. The log grows downward, so without this a
   * player who ages up at 60 is left looking at their childhood.
   */
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Jump on first paint, glide on later updates.
    el.scrollTo({
      top: el.scrollHeight,
      behavior: life.revision <= 1 ? 'auto' : 'smooth',
    });
  }, [life.revision, life.age]);

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

        {/* The open decision sits at the end of the log, where the year is. */}
        {life.activeEvent && (
          <EventCard event={life.activeEvent} onChoose={onChoose} busy={busy} />
        )}
        {life.resolvedEvent && <ResultCard event={life.resolvedEvent} onDismiss={onDismiss} />}

        {idle && life.quickActions.length > 0 && (
          <div className="action-grid">
            {life.quickActions.map((action: ActionCard) => (
              <button
                key={action.id}
                className="action"
                disabled={!action.available || busy}
                onClick={() => onAct(action.id)}
                title={action.blockedReason ?? action.note}
              >
                <span style={{ fontSize: 19, lineHeight: 1 }}>{action.icon}</span>
                <span className="action-label">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={bottom} />
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
