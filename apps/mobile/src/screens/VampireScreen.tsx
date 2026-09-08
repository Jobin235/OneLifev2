import type { VampireView } from '../lib/api';

/**
 * The one system that changes the rules of the life rather than adding a screen
 * to it: you stop getting old, and in exchange something starts looking for
 * you. Essence is what survives it and notoriety is what brings it, and every
 * feed spends the second to buy the first.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
export const VampireScreen = ({
  vampire,
  busy,
  onAct,
}: {
  vampire: VampireView;
  busy: boolean;
  onAct: (action: string) => void;
}) => {
  if (!vampire.turned) {
    return (
      <div className="sheet-scroll">
        <p className="esc-rule">
          There is somebody in this town who has been here a very long time. You could go and
          find him. You would not get old after that, and something would start looking for
          you.
        </p>
        <button
          className={`act-row${vampire.locked ? ' locked' : ''}`}
          disabled={busy || !!vampire.locked}
          onClick={() => onAct('turn')}
        >
          <span className="act-icon">🧛</span>
          <span className="act-text">
            <span className="act-label">Go and find him</span>
            <span className="act-note">
              {vampire.locked ?? 'There is no undoing this one'}
            </span>
          </span>
          <span className="act-chev">{vampire.locked ? '🔒' : '›'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sheet-scroll">
      <section className="panel ry-head">
        <p className="ry-title">{vampire.lord ? 'Vampire Lord' : 'Vampire'}</p>
        <p className="ry-house">
          {vampire.progeny > 0
            ? `${vampire.progeny} of your own making`
            : 'Nobody of your own making yet'}
        </p>

        <div className="pm-meter" style={{ marginTop: 14 }}>
          <div className="pm-meter-head">
            <span>Essence</span>
            <span>{vampire.essence}</span>
          </div>
          <div className="pr-track">
            <div
              className="pr-fill"
              style={{ width: `${Math.max(vampire.essenceBar, 2)}%`, background: 'var(--coral)' }}
            />
          </div>
        </div>

        <div className="pm-meter" style={{ marginTop: 10 }}>
          <div className="pm-meter-head">
            <span>Notoriety</span>
            <span>{vampire.notorietyWord}</span>
          </div>
          <div className="pr-track">
            <div
              className="pr-fill"
              style={{
                width: `${Math.max(vampire.notoriety, 2)}%`,
                background: vampire.notoriety >= 55 ? 'var(--coral)' : 'var(--amber)',
              }}
            />
          </div>
        </div>

        {vampire.lord && (
          <p className="pm-refs" style={{ marginTop: 10 }}>
            Nothing comes for you any more.
          </p>
        )}
      </section>

      <div className="act-list">
        {vampire.actions.map((action) => (
          <button
            key={action.id}
            className={`act-row${action.available ? '' : ' locked'}`}
            disabled={!action.available || busy}
            onClick={() => onAct(action.id)}
          >
            <span className="act-icon">{action.emoji}</span>
            <span className="act-text">
              <span className="act-label">{action.label}</span>
              <span className="act-note">{action.locked ?? action.note}</span>
            </span>
            {action.available ? <span className="act-chev">›</span> : <span className="act-lock">🔒</span>}
          </button>
        ))}
      </div>

      <p className="act-foot">
        {vampire.nightsLeft > 0
          ? `${vampire.nightsLeft} more ${vampire.nightsLeft === 1 ? 'night' : 'nights'} this year.`
          : 'The nights are getting short.'}
      </p>
    </div>
  );
};
