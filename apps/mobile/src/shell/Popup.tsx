import { useState } from 'react';
import type { ActiveEvent } from '../lib/api';

/**
 * Every interruption in the game is this one object: a header band naming a
 * person or a category, an emoji and a title, one to three sentences, the
 * question, and stacked full-width buttons. Promotions, breakups, a fever and a
 * criminal charge all arrive the same way, so the player learns one shape and
 * then only has to read the words. See docs/BITLIFE-LOOP-SPEC.md §3.
 */
export const Popup = ({
  event,
  busy,
  onChoose,
}: {
  event: ActiveEvent;
  busy: boolean;
  onChoose: (choiceId: string) => void;
}) => {
  const [confirming, setConfirming] = useState<{ id: string; label: string } | null>(null);

  const pick = (choice: { id: string; label: string; confirm?: string | null }) => {
    if (choice.confirm) setConfirming({ id: choice.id, label: choice.confirm });
    else onChoose(choice.id);
  };

  /*
   * "Surprise me!" is on every choice popup and it is not decoration — it is
   * how a lot of players actually play, blitzing a life to see where it lands.
   * Taking it away would change the game's speed.
   */
  const surprise = () => {
    const choice = event.choices[Math.floor(Math.random() * event.choices.length)];
    if (choice) onChoose(choice.id);
  };

  return (
    <div className="sh-scrim">
      <article className="sh-popup" style={{ ['--tint' as string]: event.card.color }}>
        <div className="sh-popup-band">
          {event.card.who && (
            <>
              <span className="sh-popup-face">{event.card.who.emoji}</span>
              <span className="sh-popup-whoname">{event.card.who.name}</span>
            </>
          )}
          <span className="sh-popup-cat">{event.card.label}</span>
        </div>

        <div className="sh-popup-body">
          <h2 className="sh-popup-title">
            <span className="sh-popup-emoji">{event.card.icon}</span> {event.title}
          </h2>
          {event.body.split('\n').map((para, index) => (
            <p className="sh-popup-text" key={index}>
              {para}
            </p>
          ))}

          {event.stake && (
            <div className="sh-popup-stake">
              <span>{event.stake.label}</span>
              <strong>{event.stake.value}</strong>
            </div>
          )}

          {event.question && <p className="sh-popup-q">{event.question}</p>}

          <div className="sh-popup-choices">
            {event.choices.map((choice) => (
              <button
                key={choice.id}
                className={`sh-btn${choice.disabled ? ' disabled' : ''}`}
                disabled={busy || choice.disabled}
                onClick={() => pick(choice)}
              >
                {choice.label}
                {choice.note && <span className="sh-btn-note">{choice.note}</span>}
              </button>
            ))}
          </div>

          {event.choices.length > 1 && (
            <button className="sh-surprise" disabled={busy} onClick={surprise}>
              🎲 Surprise me!
            </button>
          )}
        </div>

        {confirming && (
          <div className="sh-confirm">
            <div className="sh-confirm-card">
              <div className="sh-confirm-title">Confirm</div>
              <p className="sh-confirm-text">{confirming.label}</p>
              <div className="sh-confirm-row">
                <button className="sh-confirm-btn" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
                <button
                  className="sh-confirm-btn yes"
                  onClick={() => {
                    const id = confirming.id;
                    setConfirming(null);
                    onChoose(id);
                  }}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
      </article>
    </div>
  );
};

/**
 * The result of a choice: a written title and a sentence or two, then straight
 * back to the log. The titles are authored — "BFFL", "Denied", "Stale mate" —
 * because they are where the game's voice lives.
 */
export const ResultToast = ({
  event,
  onDismiss,
}: {
  event: ActiveEvent;
  onDismiss: () => void;
}) => (
  <div className="sh-scrim" onClick={onDismiss}>
    <div className="sh-toast" onClick={(e) => e.stopPropagation()}>
      <div className="sh-toast-title">{event.outcomeTitle ?? 'What happened'}</div>
      <p className="sh-toast-text">{event.outcomeText}</p>
      {event.deltas.length > 0 && (
        <div className="sh-toast-deltas">
          {event.deltas.map((delta, index) => (
            <span key={index} className={`sh-delta ${delta.positive ? 'up' : 'down'}`}>
              {delta.text}
            </span>
          ))}
        </div>
      )}
      <button className="sh-toast-ok" onClick={onDismiss}>
        OK
      </button>
    </div>
  </div>
);
