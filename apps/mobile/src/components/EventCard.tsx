import type { ActiveEvent } from '../lib/api';

/**
 * Design 1A and 1C use exactly the same card for a promotion, a breakup and a
 * fuel-price shock. The player is not supposed to be able to tell a world event
 * from a personal one, so there is only ever one of these components.
 */
export const EventCard = ({
  event,
  onChoose,
  busy,
}: {
  event: ActiveEvent;
  onChoose: (choiceId: string) => void;
  busy: boolean;
}) => (
  <article className="card fade-in">
    <div className="card-strip" style={{ background: event.card.tint }}>
      <span className="card-strip-icon">{event.card.icon}</span>
      <span className="card-strip-label" style={{ color: event.card.color }}>
        {event.card.label}
      </span>
    </div>
    <div className="card-body">
      <h2 className="card-title">{event.title}</h2>
      <p className="card-text">{event.body}</p>
      <div className="choices">
        {event.choices.map((choice) => (
          <button
            key={choice.id}
            className="choice"
            disabled={busy}
            onClick={() => onChoose(choice.id)}
          >
            <span className="choice-label">{choice.label}</span>
            {choice.note ? (
              <span className="choice-note">{choice.note}</span>
            ) : (
              <span className="choice-chevron">›</span>
            )}
          </button>
        ))}
      </div>
    </div>
  </article>
);

/** The "WHAT HAPPENED" card, with the delta pills. */
export const ResultCard = ({
  event,
  onDismiss,
}: {
  event: ActiveEvent;
  onDismiss: () => void;
}) => (
  <section className="result fade-in">
    <div className="eyebrow">WHAT HAPPENED</div>
    <p className="result-text">{event.outcomeText}</p>
    {event.deltas.length > 0 && (
      <div className="deltas">
        {event.deltas.map((delta, index) => (
          <span key={index} className={`delta ${delta.positive ? 'up' : 'down'}`}>
            {delta.text}
          </span>
        ))}
      </div>
    )}
    <button className="btn-dark" onClick={onDismiss}>
      Got it
    </button>
  </section>
);
