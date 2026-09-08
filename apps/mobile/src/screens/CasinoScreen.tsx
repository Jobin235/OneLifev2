import { useState } from 'react';
import type { CasinoView } from '../lib/api';

/**
 * The floor.
 *
 * A stake, a game, and where there is a choice to make, the choice. Every
 * payout here is priced under its true odds, so the number that matters most on
 * this screen is the one at the bottom saying how many goes are left.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
const STAKES = [
  { label: '$100', cents: 100_00 },
  { label: '$1,000', cents: 1_000_00 },
  { label: '$10,000', cents: 10_000_00 },
  { label: '$100,000', cents: 100_000_00 },
];

export const CasinoScreen = ({
  casino,
  busy,
  last,
  onBet,
}: {
  casino: CasinoView;
  busy: boolean;
  /** What the last spin actually did, kept on screen until the next one. */
  last: { detail: string; line: string; netLabel: string; won: boolean } | null;
  onBet: (game: string, stake: number, pick: string) => void;
}) => {
  const [stake, setStake] = useState(1_000_00);
  const [open, setOpen] = useState<string | null>('slots');

  if (casino.locked) return <p className="sh-empty">{casino.locked}.</p>;

  return (
    <div className="sheet-scroll">
      {last && (
        <section className={`panel cs-last${last.won ? ' won' : ''}`}>
          <p className="cs-detail">{last.detail}</p>
          <p className="cs-line">{last.line}</p>
          <p className="cs-net">{last.netLabel}</p>
        </section>
      )}

      <div className="cs-stakes">
        {STAKES.map((option) => (
          <button
            key={option.cents}
            className={`cs-stake${stake === option.cents ? ' on' : ''}`}
            disabled={option.cents > casino.purseCents}
            onClick={() => setStake(option.cents)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="act-list">
        {casino.games.map((game) => (
          <div key={game.id}>
            <button
              className="act-row"
              disabled={busy}
              onClick={() => {
                if (game.picks.length === 0) onBet(game.id, stake, '');
                else setOpen(open === game.id ? null : game.id);
              }}
            >
              <span className="act-icon">{game.emoji}</span>
              <span className="act-text">
                <span className="act-label">{game.label}</span>
                <span className="act-note">{game.note}</span>
              </span>
              <span className="act-chev">{game.picks.length === 0 ? '›' : open === game.id ? '⌄' : '›'}</span>
            </button>

            {open === game.id &&
              game.picks.map((pick) => (
                <button
                  key={pick.id}
                  className="act-row cs-pick"
                  disabled={busy || stake > casino.purseCents}
                  onClick={() => onBet(game.id, stake, pick.id)}
                >
                  <span className="act-text">
                    <span className="act-label">{pick.label}</span>
                  </span>
                  <span className="mk-cost">{STAKES.find((s) => s.cents === stake)?.label}</span>
                </button>
              ))}
          </div>
        ))}
      </div>

      <p className="act-foot">
        {casino.betsLeft > 0
          ? `${casino.betsLeft} more ${casino.betsLeft === 1 ? 'go' : 'goes'} this year. You have ${casino.purse}.`
          : 'That is enough for one year.'}
      </p>
    </div>
  );
};
