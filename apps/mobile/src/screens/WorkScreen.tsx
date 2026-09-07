import type { ActionCard, WorkView } from '../lib/api';

/**
 * Design 3B. A job is a ladder, a number, and the people who decide whether you
 * climb it — so it shows all three rather than a salary and a progress bar.
 */
export const WorkScreen = ({
  work,
  busy,
  decisionOpen,
  onAct,
  onOpenPerson,
}: {
  work: WorkView;
  busy: boolean;
  decisionOpen: boolean;
  onAct: (activityId: string) => void;
  onOpenPerson: (npcId: string) => void;
}) => (
  <>
    <header className="header school-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="screen-title">{work.employer}</h1>
        <div className="screen-sub">
          {work.title} · {work.salary}
        </div>
      </div>
      <div className="school-avatar" style={{ background: 'var(--green-tint)' }}>
        💼
      </div>
    </header>

    <div className="scroll" style={{ gap: 20 }}>
      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      <div className="school-meter" style={{ flex: 'none' }}>
        <div className="school-meter-label">HOW YOU'RE DOING · {work.performanceLabel}</div>
        <div className="school-meter-value">{work.performance}</div>
        <div className="school-meter-track">
          <div
            className="school-meter-fill"
            style={{ width: `${work.performance}%`, background: 'var(--green)' }}
          />
        </div>
        <div className="work-outlook">{work.outlook}</div>
      </div>

      {work.actions.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            WHAT YOU CAN DO
          </div>
          <div className="interaction-grid">
            {work.actions.map((action: ActionCard) => (
              <button
                key={action.id}
                className="interaction"
                disabled={!action.available || busy}
                onClick={() => onAct(action.id)}
                title={action.blockedReason ?? action.note}
              >
                <span className="interaction-icon">{action.icon}</span>
                <span className="interaction-label">{action.label}</span>
                <span className="interaction-note">{action.blockedReason ?? action.note}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          THE LADDER
        </div>
        <div className="ladder">
          {work.ladder.map((rung) => (
            <div
              className={`rung${rung.current ? ' current' : ''}${rung.reached ? ' reached' : ''}`}
              key={rung.title}
            >
              <span className="rung-dot" />
              <span className="rung-title">{rung.title}</span>
              <span className="rung-salary">{rung.salary}</span>
            </div>
          ))}
        </div>
      </section>

      {work.people.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            THE PEOPLE THERE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {work.people.map((person) => (
              <button
                className="person-row small"
                key={person.npcId}
                onClick={() => onOpenPerson(person.npcId)}
              >
                <div className="person-avatar">{person.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="person-name">{person.name}</div>
                  <div className="person-sub">{person.role}</div>
                </div>
                <div
                  className="person-score"
                  style={{
                    font: "800 12px/1 var(--text)",
                    color: person.closeness >= 65 ? 'var(--green)' : 'var(--muted)',
                  }}
                >
                  {person.closeness}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  </>
);
