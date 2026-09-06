import type { MoreView } from '../lib/api';

/**
 * Design 4B. Everything the old design put in the navigation bar lives here, one
 * tap deep, and each tile carries its current state so the drawer answers
 * questions without being opened.
 */
export const MoreScreen = ({ more, generation }: { more: MoreView; generation: number }) => (
  <>
    <header className="header">
      <h1 className="screen-title">More</h1>
      <div className="screen-sub">The stuff you only need sometimes</div>
    </header>

    <div className="scroll" style={{ gap: 18 }}>
      <div className="action-grid">
        {more.tiles.map((tile) => (
          <div className="tile" key={tile.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div className="tile-icon">{tile.icon}</div>
            <div className="tile-label">{tile.label}</div>
            <div className="tile-note" style={{ color: 'var(--muted)' }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="eyebrow">YOUR STORY SO FAR</div>
        <p className="panel-text">{more.storySoFar}</p>
      </section>

      <section className="panel">
        <div className="eyebrow">FAMILY LINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 13 }}>
          <div className="person-avatar" style={{ background: 'var(--violet-tint)' }}>
            👨‍👩‍👧
          </div>
          <div>
            <div className="person-name">{more.family.name}</div>
            <div className="person-sub">{more.family.line}</div>
          </div>
        </div>
      </section>

      <div style={{ font: "600 12.5px/1.55 var(--text)", color: 'var(--faint)' }}>
        Generation {generation}. Everyone plays in the same world.
      </div>
    </div>
  </>
);
