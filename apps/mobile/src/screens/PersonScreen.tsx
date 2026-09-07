import type { InteractionCard, PersonView } from '../lib/api';

const money = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/**
 * Design 2B. The relationship is a memory list, not a meter — a stored fact from
 * fifteen years ago is what makes this person feel like a person.
 */
export const PersonScreen = ({
  person,
  busy,
  decisionOpen,
  onBack,
  onInteract,
}: {
  person: PersonView;
  busy: boolean;
  decisionOpen: boolean;
  onBack: () => void;
  onInteract: (interactionId: string) => void;
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
      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      {person.interactions.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            WHAT YOU CAN DO
          </div>
          <div className="interaction-grid">
            {person.interactions.map((action: InteractionCard) => (
              <button
                key={action.id}
                className="interaction"
                disabled={!action.available || busy}
                onClick={() => onInteract(action.id)}
                title={action.blockedReason ?? undefined}
              >
                <span className="interaction-icon">{action.icon}</span>
                <span className="interaction-label">{action.label}</span>
                {action.blockedReason ? (
                  <span className="interaction-note blocked">{action.blockedReason}</span>
                ) : action.cost > 0 ? (
                  <span className="interaction-note">{money(action.cost)}</span>
                ) : action.timesLeft !== null && action.timesLeft <= 1 ? (
                  <span className="interaction-note">{action.timesLeft} left this year</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      )}

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
