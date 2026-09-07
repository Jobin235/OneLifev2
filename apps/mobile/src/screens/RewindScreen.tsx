import type { RewindOption } from '../lib/api';

/**
 * The Time Machine.
 *
 * Eight years, and the player picks how far — BitLife's numbers, and good ones.
 * The warning at the bottom is not decoration: rewinding past a death does not
 * save anybody, and a player who finds that out by trying it will feel cheated
 * rather than moved. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
export const RewindScreen = ({
  options,
  busy,
  onRewind,
}: {
  options: RewindOption[];
  busy: boolean;
  onRewind: (toAge: number) => void;
}) => (
  <div className="sheet-scroll">
    <section className="panel">
      <div className="eyebrow">GO BACK</div>
      <p className="tm-blurb">
        Pick a year. Everything after it un-happens — the decisions, what they cost you,
        and what you did with the years in between.
      </p>
    </section>

    {options.length === 0 ? (
      <p className="sh-empty">There is nothing to go back to yet.</p>
    ) : (
      <div className="act-list" style={{ padding: 0 }}>
        {options.map((option) => (
          <button
            key={option.atAge}
            className="act-row"
            disabled={busy}
            onClick={() => onRewind(option.atAge)}
          >
            <span className="act-icon">⏪</span>
            <span className="act-text">
              <span className="act-label">{option.label}</span>
              <span className="act-note">{option.note}</span>
            </span>
            <span className="act-chev">›</span>
          </button>
        ))}
      </div>
    )}

    <div className="panel tm-warning">
      <span className="tm-warning-icon">🕯️</span>
      <span>
        It will not bring anybody back. Anyone who has died stays alive only until their
        year comes round again, and then goes the same way, at the same age.
      </span>
    </div>
  </div>
);
