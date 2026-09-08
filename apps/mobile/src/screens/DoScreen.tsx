import type { ActionCard } from '../lib/api';

/**
 * Activities, as a list.
 *
 * BitLife's is dense running rows — emoji, title, one grey line, and a chevron —
 * and locked rows stay on it, greyed, with the reason. That is the difference
 * between a menu and a map: a fourteen-year-old can see what is coming, which is
 * why the screen is worth opening again next year. Our tile grid showed six
 * coloured squares and hid everything else. See docs/BITLIFE-LOOP-SPEC.md §5.
 */
const GROUP_TITLES: Record<string, string> = {
  body_and_head: 'Mind & Body',
  school: 'School',
  work: 'Work',
  relationship: 'Love & Family',
  fun_and_trouble: 'Fun & Trouble',
  bigger_moves: 'Bigger Moves',
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
  age,
  busy,
  decisionOpen,
  onAct,
  fameLine,
  onOpenFame,
  royalLine,
  onOpenRoyal,
}: {
  actions: ActionCard[];
  age: number;
  busy: boolean;
  decisionOpen: boolean;
  onAct: (activityId: string) => void;
  /** One line about who knows you, for the row that opens the Fame screen. */
  fameLine: string | null;
  onOpenFame: () => void;
  /** The title, when there is one, for the row that opens the Crown screen. */
  royalLine: string | null;
  onOpenRoyal: () => void;
}) => {
  /*
   * Everything you can do first, then everything you cannot — within each
   * group. The available rows are the ones the player is here for, and burying
   * them under a wall of grey would undo the point of showing the grey at all.
   */
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: actions
      .filter((a) => a.group === group)
      .sort((a, b) => Number(a.locked) - Number(b.locked)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="act-list">
      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      {/*
        Fame is a screen, not an activity: casting is a list of doors rather
        than a thing you tap. It sits at the top of this sheet because that is
        where BitLife keeps it and because the one activity that feeds it,
        posting, is in the list below.
      */}
      {royalLine && (
        <button className="act-row" disabled={busy} onClick={onOpenRoyal}>
          <span className="act-icon">👑</span>
          <span className="act-text">
            <span className="act-label">The Crown</span>
            <span className="act-note">{royalLine}</span>
          </span>
          <span className="act-chev">›</span>
        </button>
      )}

      {fameLine && (
        <button className="act-row" disabled={busy} onClick={onOpenFame}>
          <span className="act-icon">🌟</span>
          <span className="act-text">
            <span className="act-label">Fame</span>
            <span className="act-note">{fameLine}</span>
          </span>
          <span className="act-chev">›</span>
        </button>
      )}

      {grouped.map(({ group, items }) => (
        <section key={group}>
          <h3 className="act-group">{GROUP_TITLES[group] ?? group}</h3>
          {items.map((action) => (
            <button
              key={action.id}
              className={`act-row${action.locked ? ' locked' : ''}`}
              disabled={!action.available || busy}
              onClick={() => onAct(action.id)}
            >
              <span className="act-icon">{action.icon}</span>
              <span className="act-text">
                <span className="act-label">{action.label}</span>
                <span className="act-note">{action.blockedReason ?? action.note}</span>
              </span>
              {action.locked ? (
                <span className="act-lock">🔒</span>
              ) : action.timesLeft !== null && action.timesLeft <= 2 ? (
                <span className="act-left">{action.timesLeft} left</span>
              ) : (
                <span className="act-chev">›</span>
              )}
            </button>
          ))}
        </section>
      ))}

      <p className="act-foot">
        You&rsquo;re {age}. Do as much as you want — most things stop helping after a few
        goes, and a few start hurting.
      </p>
    </div>
  );
};
