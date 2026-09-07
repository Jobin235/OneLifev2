import type { Legacy } from '../lib/api';

/**
 * Design 4C. The only screen that changes colour — a soft violet, so it feels
 * like a chapter break rather than a fail state. The heir options are framed by
 * what they'd be like to play, not by what they inherit.
 */
export const LegacyScreen = ({
  legacy,
  busy,
  onSucceed,
}: {
  legacy: Legacy;
  busy: boolean;
  onSucceed: (heirNpcId: string | null) => void;
}) => (
  <div className="legacy">
    <div className="scroll" style={{ gap: 18, paddingTop: 'calc(8px + var(--safe-top))' }}>
      <div className="legacy-hero">
        <div className="legacy-candle">🕯️</div>
        <div className="legacy-name">{legacy.name}</div>
        <div className="legacy-dates">
          {legacy.bornYear} – {legacy.diedYear} · {legacy.age} years · {legacy.cityName}
        </div>
        <div className="legacy-epitaph">{legacy.epitaph}</div>

      {/* One word for the life. The thing you play again to change. */}
      <div className="ribbon">
        <span className="ribbon-emoji">{legacy.ribbon.emoji}</span>
        <span className="ribbon-label">{legacy.ribbon.label}</span>
      </div>
      <div className="ribbon-line">{legacy.ribbon.line}</div>
      </div>

      <section className="legacy-panel">
        <div className="eyebrow">THE WHOLE STORY</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
          {legacy.chapters.map((chapter, index) => (
            <div key={index}>
              <div className="chapter-age">
                {chapter.fromAge}–{chapter.toAge}
              </div>
              <div className="chapter-title">{chapter.title}</div>
              <div className="chapter-body">{chapter.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="legacy-panel">
        <div className="eyebrow">HOW PEOPLE SAW THEM</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          {legacy.howPeopleSawYou.map((row, index) => (
            <div key={index}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ font: "700 13.5px/1.3 var(--text)" }}>{row.who}</span>
                <span
                  style={{ font: "800 13px/1.3 var(--text)", color: 'var(--violet-deep)', flex: 'none' }}
                >
                  {row.verdict}
                </span>
              </div>
              <div style={{ font: "600 13px/1.5 var(--text)", color: 'var(--muted)', marginTop: 5 }}>
                {row.line}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="legacy-panel">
        <div className="eyebrow">WHAT THEY ACTUALLY CHANGED</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {legacy.whatYouChanged.map((row, index) => (
            <div key={index} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 17, lineHeight: 1.2, flex: 'none' }}>{row.icon}</span>
              <span
                style={{ font: "600 13.5px/1.55 var(--text)", color: 'var(--body)', textWrap: 'pretty' }}
              >
                {row.line}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="legacy-panel">
        <div className="eyebrow">A LIFE, IN NUMBERS</div>
        <div className="numbers" style={{ marginTop: 16 }}>
          {legacy.numbers.map((number, index) => (
            <div key={index}>
              <div className="number-value">{number.value}</div>
              <div className="number-label">{number.label}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            font: "600 12.5px/1.55 var(--text)",
            color: 'var(--muted)',
            marginTop: 18,
            textWrap: 'pretty',
          }}
        >
          {legacy.comparison}
        </div>
      </section>

      <section className="legacy-panel">
        <div className="eyebrow">WHAT THEY LEFT</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 13 }}>
          {legacy.whatYouLeft.map((item, index) => (
            <span
              key={index}
              style={{
                background: 'var(--violet-tint)',
                borderRadius: 'var(--r-pill)',
                padding: '7px 12px',
                font: "800 12.5px/1 var(--text)",
                color: 'var(--violet-deep)',
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="legacy-panel">
        <div className="eyebrow">WHO DO YOU WANT TO BE NOW?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
          {legacy.heirs.map((heir, index) => (
            <button
              key={index}
              className="heir"
              disabled={busy}
              onClick={() => onSucceed(heir.npcId)}
            >
              <span className="heir-emoji">{heir.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="heir-name" style={{ display: 'block' }}>
                  {heir.name}
                </span>
                <span className="heir-pitch" style={{ display: 'block' }}>
                  {heir.pitch}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  </div>
);
