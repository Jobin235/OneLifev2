import type { RoyalView } from '../lib/api';

/**
 * The crown.
 *
 * One meter runs this whole screen, which is the point: a royal has no salary
 * to grow and no ladder to climb, only what the country thinks of them. Every
 * row below spends or earns that one number, and at zero the subjects take the
 * title back. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
export const RoyalScreen = ({
  royal,
  busy,
  decisionOpen,
  onAct,
}: {
  royal: RoyalView;
  busy: boolean;
  decisionOpen: boolean;
  onAct: (action: string) => void;
}) => {
  const colour =
    royal.respect >= 65 ? 'var(--green)' : royal.respect >= 35 ? 'var(--amber)' : 'var(--coral)';

  return (
    <div className="sheet-scroll">
      <section className="panel ry-head">
        <p className="ry-title">{royal.title}</p>
        <p className="ry-house">
          {royal.house} · {royal.origin.toLowerCase()}
        </p>

        <div className="pm-meter" style={{ marginTop: 14 }}>
          <div className="pm-meter-head">
            <span>Respect</span>
            <span>{royal.respectWord}</span>
          </div>
          <div className="pr-track">
            <div
              className="pr-fill"
              style={{ width: `${Math.max(royal.respect, 2)}%`, background: colour }}
            />
          </div>
        </div>

        {royal.line && <p className="ry-line">{royal.line}.</p>}
        {royal.respect <= 20 && (
          <p className="ry-warn">
            They are talking about you in the squares. At nothing, they come for the title.
          </p>
        )}
      </section>

      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      <div className="act-list">
        {royal.actions.map((action) => (
          <button
            key={action.id}
            className={`act-row${action.available ? '' : ' locked'}`}
            disabled={!action.available || busy || decisionOpen}
            onClick={() => onAct(action.id)}
          >
            <span className="act-icon">{action.icon}</span>
            <span className="act-text">
              <span className="act-label">{action.label}</span>
              <span className="act-note">{action.locked ?? action.note}</span>
            </span>
            {action.available ? (
              <span className="act-chev">›</span>
            ) : (
              <span className="act-lock">🔒</span>
            )}
          </button>
        ))}
      </div>

      <p className="act-foot">
        {royal.dutiesLeft > 0
          ? `${royal.dutiesLeft} more thing${royal.dutiesLeft === 1 ? '' : 's'} this year. Nobody is counting except everybody.`
          : 'You have done enough for one year. The country will keep its opinion until your birthday.'}
      </p>
    </div>
  );
};
