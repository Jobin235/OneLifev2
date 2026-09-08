import { useState } from 'react';
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
  onInteract: (interactionId: string, optionId?: string | null) => void;
}) => {
  /*
   * Which submenu is open, if any. "Spend time" and "Give a gift" are
   * categories rather than acts: which afternoon, and how much you spent, is
   * the whole of the gesture, and a tile that resolved either of them in one
   * tap threw away the only decision in it.
   */
  const [open, setOpen] = useState<string | null>(null);
  const opened = person.interactions.find((a) => a.id === open) ?? null;

  return (
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
      {/*
        * Meters are a statement about where a relationship *is*, which is not a
        * thing a dead person has. The page becomes what is left of them.
        */}
      {!person.gone && (
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
      )}
    </div>

    <div className="scroll" style={{ gap: 18 }}>
      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      {person.gone && (
        <div className="notice gone-notice">
          <span>🕯️</span>
          <span>
            {person.epitaph ?? `${person.name.split(' ')[0]} is gone.`} What is here is what you
            had, which is more than nothing.
          </span>
        </div>
      )}

      {!person.gone && person.interactions.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            {opened ? opened.label.toUpperCase() : 'WHAT YOU CAN DO'}
          </div>

          {/*
            * A submenu replaces the grid rather than appearing under it. On a
            * phone the grid is eleven tiles tall, so a list rendered beneath it
            * opens somewhere the player cannot see — which reads as the tap
            * having done nothing at all.
            */}
          {opened ? (
            <div className="int-options">
              {opened.options.map((option) => (
                <button
                  key={option.id}
                  className="act-row"
                  disabled={busy || !option.affordable || !opened.available}
                  onClick={() => {
                    onInteract(opened.id, option.id);
                    setOpen(null);
                  }}
                >
                  <span className="act-text">
                    <span className="act-label">{option.label}</span>
                    <span className="act-note">
                      {option.affordable ? option.note : 'You cannot afford that'}
                    </span>
                  </span>
                  <span className="mk-cost">{option.cost > 0 ? money(option.cost) : 'Free'}</span>
                </button>
              ))}
              <button className="act-row int-back" onClick={() => setOpen(null)}>
                <span className="act-text">
                  <span className="act-label">‹ Never mind</span>
                </span>
              </button>
            </div>
          ) : (
            <div className="interaction-grid">
              {person.interactions.map((action: InteractionCard) => (
                <button
                  key={action.id}
                  className="interaction"
                  disabled={!action.available || busy}
                  onClick={() =>
                    action.options.length > 0 ? setOpen(action.id) : onInteract(action.id)
                  }
                  title={action.blockedReason ?? undefined}
                >
                  <span className="interaction-icon">{action.icon}</span>
                  <span className="interaction-label">{action.label}</span>
                  {action.blockedReason ? (
                    <span className="interaction-note blocked">{action.blockedReason}</span>
                  ) : action.options.length > 0 ? (
                    <span className="interaction-note">{action.options.length} to choose from</span>
                  ) : action.cost > 0 ? (
                    <span className="interaction-note">{money(action.cost)}</span>
                  ) : action.timesLeft !== null && action.timesLeft <= 1 ? (
                    <span className="interaction-note">{action.timesLeft} left this year</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
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
};
