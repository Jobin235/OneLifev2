import type { ActionCard } from '../lib/api';

/**
 * Design 2C. Colour groups the kind of thing you're doing: green for upkeep,
 * violet for growth, amber for fun, coral for risk. Costs and effects are visible
 * up front so the player is making a bet, not guessing.
 */
const GROUP_TITLES: Record<string, string> = {
  body_and_head: 'YOUR BODY & HEAD',
  fun_and_trouble: 'FUN & TROUBLE',
  school: 'SCHOOL',
  work: 'AT WORK YOU CAN',
  relationship: 'THE PEOPLE IN IT',
  bigger_moves: 'BIGGER MOVES',
};

const GROUP_ORDER = [
  'body_and_head',
  'school',
  'work',
  'relationship',
  'fun_and_trouble',
  'bigger_moves',
];

export const DoScreen = ({
  actions,
  remaining,
  age,
  busy,
  onAct,
}: {
  actions: ActionCard[];
  remaining: number;
  age: number;
  busy: boolean;
  onAct: (activityId: string) => void;
}) => {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: actions.filter((a) => a.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <header className="header">
        <h1 className="screen-title">Do something</h1>
        <div className="screen-sub">
          You're {age}. {remaining === 0 ? 'Nothing left this year.' : `${remaining} thing${remaining === 1 ? '' : 's'} left this year.`}
        </div>
      </header>

      <div className="scroll" style={{ gap: 20 }}>
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <div className="eyebrow" style={{ marginBottom: 11 }}>
              {GROUP_TITLES[group] ?? group}
            </div>

            {group === 'bigger_moves' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {items.map((action) => (
                  <button
                    key={action.id}
                    className="row-button"
                    disabled={!action.available || busy}
                    onClick={() => onAct(action.id)}
                  >
                    <span className="row-button-label">
                      {action.icon}&nbsp;&nbsp;{action.label}
                    </span>
                    <span className="choice-note">{action.blockedReason ?? action.note}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="action-grid">
                {items.map((action) => (
                  <button
                    key={action.id}
                    className="tile"
                    style={{ background: action.tint }}
                    disabled={!action.available || busy}
                    onClick={() => onAct(action.id)}
                  >
                    <div className="tile-icon">{action.icon}</div>
                    <div className="tile-label">{action.label}</div>
                    <div className="tile-note" style={{ color: action.noteColor }}>
                      {action.blockedReason ?? action.note}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div
          style={{
            font: "600 12.5px/1.55 var(--text)",
            color: 'var(--faint)',
            textWrap: 'pretty',
          }}
        >
          Actions are limited per year, so a year has to be spent rather than farmed.
        </div>
      </div>
    </>
  );
};
