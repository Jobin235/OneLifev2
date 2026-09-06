/** Design: five tabs, and deliberately no World tab. */
export type Tab = 'life' | 'people' | 'do' | 'money' | 'more';

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'life', icon: '🌱', label: 'Life' },
  { id: 'people', icon: '👥', label: 'People' },
  { id: 'do', icon: '✨', label: 'Do' },
  { id: 'money', icon: '💵', label: 'Money' },
  { id: 'more', icon: '⋯', label: 'More' },
];

export const Tabs = ({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) => (
  <nav className="tabs">
    {TABS.map((tab) => (
      <button
        key={tab.id}
        className={`tab${tab.id === active ? ' active' : ''}`}
        onClick={() => onChange(tab.id)}
        aria-current={tab.id === active}
      >
        <span className="tab-icon">{tab.icon}</span>
        <span className="tab-label">{tab.label}</span>
      </button>
    ))}
  </nav>
);
