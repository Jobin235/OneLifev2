import type { ActionCard, LifeView } from '../lib/api';
import { EventCard, ResultCard } from '../components/EventCard';

/**
 * Design 1A. Everything the player needs is above the fold: who they are, how
 * they're doing, what's happening, and one big button.
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

      <div className="scroll">
        {life.activeEvent && (
          <EventCard event={life.activeEvent} onChoose={onChoose} busy={busy} />
        )}
        {life.resolvedEvent && <ResultCard event={life.resolvedEvent} onDismiss={onDismiss} />}

        {idle && (
          <>
            <div className="quiet">
              <div style={{ fontSize: 24, lineHeight: 1 }}>🌤️</div>
              <div className="quiet-title">A quiet stretch.</div>
              <div className="quiet-text">Do something with the year, or let it pass.</div>
            </div>

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
          </>
        )}

        <div className="history">
          <div className="eyebrow">EARLIER THIS YEAR</div>
          {life.earlierThisYear.length > 0 ? (
            life.earlierThisYear.map((entry, index) => (
              <div className="history-row" key={index}>
                <span>{entry.icon}</span>
                <span>{entry.text}</span>
              </div>
            ))
          ) : (
            <div className="history-row">
              <span>🌱</span>
              <span>Nothing yet — this year has only just started.</span>
            </div>
          )}
        </div>
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
