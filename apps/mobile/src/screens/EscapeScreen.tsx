import type { EscapeView } from '../lib/api';

/**
 * The maze.
 *
 * One rule, stated on screen because the whole puzzle is knowing it: the guard
 * moves twice for every move you make, only ever toward you, and tries to move
 * horizontally first. He is not pathfinding — he can be walked into a wall and
 * left there, and that is how this is won. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
const ARROWS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };

export const EscapeScreen = ({
  escape,
  busy,
  onMove,
}: {
  escape: EscapeView;
  busy: boolean;
  onMove: (move: string) => void;
}) => {
  const over = escape.outcome !== null;
  const cell = (x: number, y: number): { text: string; className: string } => {
    if (escape.player.x === x && escape.player.y === y) return { text: '🏃', className: 'me' };
    if (escape.guard.x === x && escape.guard.y === y) return { text: '👮', className: 'guard' };
    if (escape.exit.x === x && escape.exit.y === y) return { text: '🚪', className: 'exit' };
    return { text: '', className: escape.rows[y]?.[x] === '#' ? 'wall' : 'floor' };
  };

  return (
    <div className="sheet-scroll">
      <p className="esc-rule">
        The guard moves <b>twice</b> for every move you make. He only comes toward you, and he
        tries to go sideways first.
      </p>

      <div
        className="esc-grid"
        style={{ gridTemplateColumns: `repeat(${escape.width}, 1fr)` }}
      >
        {Array.from({ length: escape.height }, (_, y) =>
          Array.from({ length: escape.width }, (_, x) => {
            const { text, className } = cell(x, y);
            return (
              <div key={`${x},${y}`} className={`esc-cell ${className}`}>
                {text}
              </div>
            );
          }),
        )}
      </div>

      {over ? (
        <p className="esc-outcome">
          {escape.outcome === 'escaped'
            ? 'You are over the wall.'
            : escape.outcome === 'surrendered'
              ? 'You gave yourself up.'
              : 'They had you before the door.'}
        </p>
      ) : (
        <>
          <div className="esc-pad">
            <button
              className="esc-btn up"
              disabled={busy || !escape.legal.includes('up')}
              onClick={() => onMove('up')}
            >
              {ARROWS.up}
            </button>
            <button
              className="esc-btn left"
              disabled={busy || !escape.legal.includes('left')}
              onClick={() => onMove('left')}
            >
              {ARROWS.left}
            </button>
            <div className="esc-moves">{escape.moves}</div>
            <button
              className="esc-btn right"
              disabled={busy || !escape.legal.includes('right')}
              onClick={() => onMove('right')}
            >
              {ARROWS.right}
            </button>
            <button
              className="esc-btn down"
              disabled={busy || !escape.legal.includes('down')}
              onClick={() => onMove('down')}
            >
              {ARROWS.down}
            </button>
          </div>

          <button className="esc-give" disabled={busy} onClick={() => onMove('surrender')}>
            Give yourself up
          </button>
        </>
      )}
    </div>
  );
};
