import type { Recap } from '../lib/api';

/**
 * Design 1B. The reward screen. It never lists everything that happened — four
 * lines, written like a friend recapping your year, plus a nudge at what is
 * coming so the next Age Up has a pull.
 */
export const RecapScreen = ({
  recap,
  dateLine,
  cityName,
  onContinue,
}: {
  recap: Recap;
  dateLine: string;
  cityName: string;
  onContinue: () => void;
}) => (
  <div className="recap">
    <div className="scroll" style={{ paddingTop: 'calc(28px + var(--safe-top))', gap: 18 }}>
      <div className="recap-hero">
        <div className="recap-cake">🎂</div>
        <div className="recap-age">You're {recap.age + 1}.</div>
        <div className="recap-date">
          {dateLine} · {cityName}
        </div>
      </div>

      {recap.lines.length > 0 && (
        <section className="card" style={{ boxShadow: '0 5px 0 var(--line)' }}>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="eyebrow">YOUR YEAR AT {recap.age}</div>
            {recap.lines.map((line, index) => (
              <div className="recap-line" key={index}>
                <span>{line.icon}</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {recap.statDeltas.length > 0 && (
        <section className="panel">
          <div className="eyebrow">HOW YOU CHANGED</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {recap.statDeltas.map((stat) => (
              <div className="stat-change" key={stat.key}>
                <span style={{ fontSize: 17, lineHeight: 1, flex: 'none' }}>{stat.icon}</span>
                <span className="label">{stat.label}</span>
                <span
                  className="value"
                  style={{ color: stat.delta > 0 ? 'var(--green)' : 'var(--coral)' }}
                >
                  {stat.value}&nbsp;&nbsp;{stat.delta > 0 ? '+' : '−'}
                  {Math.abs(stat.delta)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {recap.foreshadow && (
        <div className="foreshadow">
          <span style={{ fontSize: 19, lineHeight: 1.1, flex: 'none' }}>✨</span>
          <span>{recap.foreshadow}</span>
        </div>
      )}
    </div>

    <div className="footer" style={{ background: 'transparent', borderTop: 0 }}>
      <button className="age-up" onClick={onContinue}>
        Keep going →
      </button>
    </div>
  </div>
);
