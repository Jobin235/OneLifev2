import type { PersonView } from '../lib/api';

/**
 * Design 2B. The relationship is a memory list, not a meter — a stored fact from
 * fifteen years ago is what makes this person feel like a person.
 */
export const PersonScreen = ({
  person,
  onBack,
}: {
  person: PersonView;
  onBack: () => void;
}) => (
  <>
    <div className="person-hero">
      <button
        onClick={onBack}
        style={{
          position: 'absolute',
          left: 18,
          top: 'calc(20px + var(--safe-top))',
          font: "800 13px/1 var(--text)",
          color: 'var(--pink-muted)',
        }}
      >
        ‹ Back
      </button>
      <div className="person-hero-avatar">{person.emoji}</div>
      <div className="person-hero-name">{person.name}</div>
      <div className="person-hero-sub">{person.header}</div>
      <div className="meters">
        {person.meters.map((meter) => (
          <div
            className="meter"
            key={meter.label}
            style={{ color: meter.label === 'Love' ? 'var(--pink)' : 'var(--muted)' }}
          >
            {meter.icon} {meter.label} {meter.value}
          </div>
        ))}
      </div>
    </div>

    <div className="scroll" style={{ gap: 18 }}>
      {person.memories.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            YOU TWO, SO FAR
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {person.memories.map((memory, index) => (
              <div className="memory" key={index}>
                <span className="memory-age">{memory.atAge}</span>
                <span className="memory-line">{memory.line}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {person.onTheirMind && (
        <section className="panel">
          <div className="eyebrow">ON THEIR MIND</div>
          <p className="panel-text">{person.onTheirMind}</p>
        </section>
      )}

      {person.stats.length > 0 && (
        <section className="panel">
          <div className="eyebrow">HOW THEY'RE DOING</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            {person.stats.map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center', minWidth: 44 }}>
                <div style={{ fontSize: 18, lineHeight: 1 }}>{stat.icon}</div>
                <div style={{ font: "800 13px/1 var(--text)", marginTop: 6 }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div
        style={{
          font: "600 13px/1.55 var(--text)",
          color: 'var(--faint)',
          textWrap: 'pretty',
        }}
      >
        {person.descriptor}
      </div>
    </div>
  </>
);
