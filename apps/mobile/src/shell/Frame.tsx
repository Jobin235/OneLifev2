import type { ReactNode } from 'react';
import type { LifeView } from '../lib/api';

/**
 * BitLife's shell, in our colours.
 *
 * The whole game is one screen. The log fills it; the header, the nav and the
 * stats never move; every tab is a sheet that slides over the log rather than a
 * place you navigate to. That is the difference between a life you are living
 * and an app you are browsing, and it is the thing the previous seven-tab
 * client got wrong. See docs/BITLIFE-LOOP-SPEC.md §1.
 */

export const Header = ({ life }: { life: LifeView }) => {
  const negative = life.balance.startsWith('−') || life.balance.startsWith('-');
  return (
    <header className="sh-header">
      <div className="sh-avatar">{life.avatarEmoji}</div>
      <div className="sh-who">
        <div className="sh-name">{life.name}</div>
        <div className="sh-station">{life.station}</div>
      </div>
      <div className="sh-bank">
        <div className={`sh-balance${negative ? ' negative' : ''}`}>{life.balance}</div>
        <div className="sh-bank-label">Bank Balance</div>
      </div>
    </header>
  );
};

/**
 * Pinned under the nav and never hidden. A stat in trouble swaps its emoji for
 * a warning and turns red, so a life going wrong is visible without opening
 * anything — BitLife does this and it is why you feel health slipping.
 */
export const StatsBar = ({ life }: { life: LifeView }) => (
  <div className="sh-stats">
    {life.stats.map((stat) => {
      const critical = stat.value <= 15;
      const low = stat.value <= 35;
      return (
        <div className="sh-stat" key={stat.key}>
          <span className={`sh-stat-icon${critical ? ' critical' : ''}`}>
            {critical ? '⚠️' : stat.icon}
          </span>
          <span className="sh-stat-label">{stat.label}</span>
          <span className="sh-stat-track">
            <span
              className="sh-stat-fill"
              style={{
                width: `${Math.max(stat.value, 1)}%`,
                background: critical ? 'var(--coral)' : low ? 'var(--amber)' : stat.color,
              }}
            />
          </span>
          <span className="sh-stat-value">{stat.value}%</span>
        </div>
      );
    })}
  </div>
);

export type Slot = 'context' | 'assets' | 'relationships' | 'activities';

const CONTEXT_LABEL: Record<LifeView['navSlot'], { icon: string; label: string }> = {
  school: { icon: '🏫', label: 'School' },
  occupation: { icon: '💼', label: 'Occupation' },
  prison: { icon: '🚔', label: 'Prison' },
};

/**
 * Five slots, and the centre one is the game. Age Up is a raised circle rather
 * than a bar across the bottom because it is pressed a hundred times a life and
 * has to be reachable with a thumb without looking.
 */
export const BottomNav = ({
  life,
  open,
  busy,
  onOpen,
  onAgeUp,
}: {
  life: LifeView;
  open: Slot | null;
  busy: boolean;
  onOpen: (slot: Slot | null) => void;
  onAgeUp: () => void;
}) => {
  const context = CONTEXT_LABEL[life.navSlot];
  const slot = (id: Slot, icon: string, label: string) => (
    <button
      className={`sh-nav-btn${open === id ? ' active' : ''}`}
      onClick={() => onOpen(open === id ? null : id)}
      aria-current={open === id}
    >
      <span className="sh-nav-icon">{icon}</span>
      <span className="sh-nav-label">{label}</span>
    </button>
  );

  return (
    <nav className="sh-nav">
      {slot('context', context.icon, context.label)}
      {slot('assets', '🏠', 'Assets')}
      <button
        className={`sh-age${life.canAgeUp ? '' : ' blocked'}`}
        disabled={!life.canAgeUp || busy}
        onClick={onAgeUp}
        aria-label={`Age up to ${life.age + 1}`}
      >
        <span className="sh-age-plus">+</span>
        <span className="sh-age-word">Age</span>
      </button>
      {slot('relationships', '❤️', 'Relations')}
      {slot('activities', '⋯', 'Activities')}
    </nav>
  );
};

/**
 * A tab is a sheet over the log, with its own title bar. Closing it puts you
 * back exactly where you were, because you never left.
 */
export const Sheet = ({
  title,
  onBack,
  onClose,
  children,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) => (
  <section className="sh-sheet">
    <div className="sh-sheet-bar">
      <button className="sh-sheet-x" onClick={onBack ?? onClose} aria-label={onBack ? 'Back' : 'Close'}>
        {onBack ? '‹' : '✕'}
      </button>
      <h2 className="sh-sheet-title">{title}</h2>
      <span className="sh-sheet-x ghost" aria-hidden="true" />
    </div>
    <div className="sh-sheet-body">{children}</div>
  </section>
);
