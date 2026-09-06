import type { PeopleView, PersonRow } from '../lib/api';

/**
 * Design 2A. Grouped by closeness, not by category, and each subtitle carries a
 * fact rather than a label — that is what makes it feel like people instead of a
 * contacts app.
 */
export const PeopleScreen = ({
  people,
  onOpen,
}: {
  people: PeopleView;
  onOpen: (npcId: string) => void;
}) => (
  <>
    <header className="header">
      <h1 className="screen-title">People</h1>
      <div className="screen-sub">{people.headline}</div>
    </header>

    <div className="scroll" style={{ gap: 18 }}>
      <Group title="CLOSE" rows={people.close} onOpen={onOpen} />
      <Group title="AROUND" rows={people.around} small onOpen={onOpen} />

      {people.driftedLine && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            DRIFTED AWAY
          </div>
          <div className="panel" style={{ padding: '15px 16px' }}>
            <span
              style={{
                font: "600 13.5px/1.5 var(--text)",
                color: 'var(--muted)',
                textWrap: 'pretty',
              }}
            >
              {people.driftedLine}
            </span>
          </div>
        </div>
      )}
    </div>
  </>
);

const Group = ({
  title,
  rows,
  small,
  onOpen,
}: {
  title: string;
  rows: PersonRow[];
  small?: boolean;
  onOpen: (npcId: string) => void;
}) => {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {title}
      </div>
      <div className="group">
        {rows.map((row) => (
          <button
            key={row.npcId}
            className={`person-row${small ? ' small' : ''}`}
            onClick={() => onOpen(row.npcId)}
          >
            <div className="person-avatar">{row.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="person-name">{row.name}</div>
              <div className="person-sub">{row.subtitle}</div>
            </div>
            <div className="person-score">
              {!small && <div style={{ fontSize: 15, lineHeight: 1 }}>{row.scoreIcon}</div>}
              <div className="person-score-value" style={{ color: row.scoreColor }}>
                {row.score}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
