import type { VigilanteView } from '../lib/api';

/**
 * The other life.
 *
 * Two meters, and they are not the same kind of thing. Standing is what the
 * city thinks and is a score. Suspicion is a countdown: it only ever goes one
 * way while you are working, and at the end of it somebody knocks on the door
 * of the first life holding a photograph of the second.
 */
const Meter = ({
  label,
  value,
  word,
  danger,
}: {
  label: string;
  value: number;
  word: string;
  danger?: boolean;
}) => (
  <div className="pm-meter" style={{ marginTop: 12 }}>
    <div className="pm-meter-head">
      <span>{label}</span>
      <span>{word}</span>
    </div>
    <div className="pr-track">
      <div
        className="pr-fill"
        style={{
          width: `${Math.max(value, 2)}%`,
          background: danger
            ? value >= 55
              ? 'var(--coral)'
              : 'var(--amber)'
            : value >= 60
              ? 'var(--green)'
              : value >= 35
                ? 'var(--amber)'
                : 'var(--coral)',
        }}
      />
    </div>
  </div>
);

export const VigilanteScreen = ({
  vigilante,
  busy,
  decisionOpen,
  onAct,
}: {
  vigilante: VigilanteView;
  busy: boolean;
  decisionOpen: boolean;
  onAct: (action: string, gearId?: string) => void;
}) => {
  if (vigilante.unmasked && !vigilante.active) {
    return (
      <p className="sh-empty">
        Everybody knows you were {vigilante.alias}. There is no going back out.
      </p>
    );
  }

  if (!vigilante.active) {
    return (
      <div className="sheet-scroll">
        <p className="esc-rule">
          You could go out at night and do something about it. The city will decide what to
          call you, and somebody will eventually work out who you are — that is the whole
          wager.
        </p>
        <button
          className={`act-row${vigilante.locked ? ' locked' : ''}`}
          disabled={busy || vigilante.locked !== null || decisionOpen}
          onClick={() => onAct('start')}
        >
          <span className="act-icon">🌃</span>
          <span className="act-text">
            <span className="act-label">Go out</span>
            <span className="act-note">{vigilante.locked ?? 'Buy something for your face after'}</span>
          </span>
          <span className="act-chev">›</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sheet-scroll">
      <section className="panel ry-head">
        <p className="ry-title">{vigilante.alias}</p>
        <p className="ry-house">
          {vigilante.saved} got home
          {vigilante.broken > 0 ? ` · ${vigilante.broken} in hospital` : ''}
        </p>

        <Meter
          label="What the city thinks"
          value={vigilante.standing}
          word={vigilante.standingWord}
        />
        <Meter
          label="How close they are"
          value={vigilante.suspicion}
          word={vigilante.suspicionWord}
          danger
        />

        {vigilante.suspicion >= 55 && (
          <p className="ry-warn">
            Somebody is close. A year off would put a lot of distance between the two of you.
          </p>
        )}
      </section>

      <div className="act-list">
        <button
          className={`act-row${vigilante.nightsLeft > 0 && !vigilante.locked ? '' : ' locked'}`}
          disabled={vigilante.nightsLeft === 0 || busy || vigilante.locked !== null || decisionOpen}
          onClick={() => onAct('out')}
        >
          <span className="act-icon">🌃</span>
          <span className="act-text">
            <span className="act-label">Go out tonight</span>
            <span className="act-note">
              {vigilante.locked ?? 'Whatever you find, you decide what to do about it'}
            </span>
          </span>
          <span className="act-chev">›</span>
        </button>

        <button
          className={`act-row${vigilante.locked ? ' locked' : ''}`}
          disabled={busy || vigilante.locked !== null || decisionOpen}
          onClick={() => onAct('low')}
        >
          <span className="act-icon">🌙</span>
          <span className="act-text">
            <span className="act-label">Leave the coat where it is</span>
            <span className="act-note">A year off. The only thing that buys real distance</span>
          </span>
          <span className="act-chev">›</span>
        </button>
      </div>

      <h3 className="act-group">What you take with you</h3>
      <div className="act-list">
        {vigilante.gear.map((item) => (
          <button
            key={item.id}
            className={`act-row${item.owned || !item.affordable ? ' locked' : ''}`}
            disabled={item.owned || !item.affordable || busy}
            onClick={() => onAct('gear', item.id)}
          >
            <span className="act-icon">{item.emoji}</span>
            <span className="act-text">
              <span className="act-label">{item.label}</span>
              <span className="act-note">{item.note}</span>
            </span>
            <span className="mk-cost">{item.owned ? '✓' : item.price}</span>
          </button>
        ))}
      </div>

      <p className="act-foot">
        {vigilante.nightsLeft > 0
          ? `${vigilante.nightsLeft} more ${vigilante.nightsLeft === 1 ? 'night' : 'nights'} this year.`
          : 'That is enough for one year.'}
      </p>
    </div>
  );
};
