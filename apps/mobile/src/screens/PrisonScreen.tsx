import type { ActionCard, PrisonView } from '../lib/api';

/**
 * Prison is a place you live in for years, not a state you wait out.
 *
 * BitLife swaps the Occupation slot for a Prison one and gives it a screen of
 * its own — what you are in for, how long is left, how you are getting on, and
 * a menu of things to do with the time. Ours said "You are serving a sentence."
 * and nothing else, which meant a decade of a life had no surface at all.
 * See docs/BITLIFE-LOOP-SPEC.md §5.
 */
export const PrisonScreen = ({
  prison,
  busy,
  decisionOpen,
  onAct,
  onEscape,
}: {
  prison: PrisonView;
  busy: boolean;
  decisionOpen: boolean;
  onAct: (activityId: string) => void;
  onEscape: () => void;
}) => (
  <div className="sheet-scroll">
    {decisionOpen && (
      <div className="notice">
        <span>👆</span>
        <span>Something is waiting on your answer. Decide first.</span>
      </div>
    )}

    <section className="panel">
      <div className="eyebrow">SENTENCE</div>
      <h2 className="pr-facility">{prison.facility}</h2>
      <p className="pr-offence">{prison.offence}</p>

      <div className="pr-meter">
        <div className="pr-meter-head">
          <span>{prison.sentence}</span>
          <span>
            {prison.yearsLeft} {prison.yearsLeft === 1 ? 'year' : 'years'} left
          </span>
        </div>
        <div className="pr-track">
          <div className="pr-fill" style={{ width: `${prison.served}%` }} />
        </div>
      </div>

      <div className="pr-meter">
        <div className="pr-meter-head">
          <span>Behaviour</span>
          <span>{prison.behaviourLabel}</span>
        </div>
        <div className="pr-track">
          <div
            className="pr-fill behaviour"
            style={{
              width: `${Math.max(prison.behaviour, 2)}%`,
              background: prison.behaviour >= 45 ? 'var(--green)' : 'var(--coral)',
            }}
          />
        </div>
      </div>

      {/* The one fact that decides whether the parole row is worth tapping. */}
      <p className="pr-parole">{prison.parole}</p>
    </section>

    {prison.inmates.length > 0 && (
      <section className="panel">
        <div className="eyebrow">WHO YOU ARE IN HERE WITH</div>
        <div className="pr-inmates">
          {prison.inmates.map((inmate) => (
            <div className="pr-inmate" key={inmate.npcId}>
              <span className="pr-inmate-face">{inmate.emoji}</span>
              <span className="pr-inmate-name">{inmate.name}</span>
            </div>
          ))}
        </div>
      </section>
    )}

    <div className="act-list" style={{ padding: 0 }}>
      {/*
        Over the wall sits above the ordinary menu because it is not one of the
        ordinary things: it is the only row in here that can end the sentence
        today, and the only one that can make it longer.
      */}
      <button className="act-row" disabled={busy || decisionOpen} onClick={onEscape}>
        <span className="act-icon">🏃</span>
        <span className="act-text">
          <span className="act-label">Go over the wall</span>
          <span className="act-note">One way out. One guard, and he is quicker than you</span>
        </span>
        <span className="act-chev">›</span>
      </button>

      {prison.actions.map((action: ActionCard) => (
        <button
          key={action.id}
          className={`act-row${action.locked ? ' locked' : ''}`}
          disabled={!action.available || busy}
          onClick={() => onAct(action.id)}
        >
          <span className="act-icon">{action.icon}</span>
          <span className="act-text">
            <span className="act-label">{action.label}</span>
            <span className="act-note">{action.blockedReason ?? action.note}</span>
          </span>
          {action.locked ? (
            <span className="act-lock">🔒</span>
          ) : action.timesLeft !== null && action.timesLeft <= 2 ? (
            <span className="act-left">{action.timesLeft} left</span>
          ) : (
            <span className="act-chev">›</span>
          )}
        </button>
      ))}
    </div>
  </div>
);
