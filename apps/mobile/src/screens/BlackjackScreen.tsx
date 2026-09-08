import { useState } from 'react';
import type { BlackjackView } from '../lib/api';

/**
 * The table.
 *
 * The casino's other games are one tap each, because a slot machine genuinely
 * is one tap. Blackjack is not: the whole of it is sixteen against a ten and
 * being the one who has to decide. So this screen deals a hand and then waits —
 * two cards up, one of the dealer's face down, and hit, stand or double until
 * there is nothing left to choose.
 *
 * The bet is set before the cards come out and cannot be changed afterwards,
 * which is what makes doubling a decision rather than a discount.
 */
export const BlackjackScreen = ({
  table,
  busy,
  onDeal,
  onHit,
  onStand,
  onDouble,
}: {
  table: BlackjackView;
  busy: boolean;
  onDeal: (stake: number) => void;
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
}) => {
  const [stake, setStake] = useState(Math.min(5_000, table.maxStake));
  const hand = table.hand;
  const playing = hand !== null && !hand.settled;

  if (table.locked && !playing) return <p className="sh-empty">{table.locked}.</p>;

  const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  const step = Math.max(table.minimum, Math.round(table.maxStake / 100));

  return (
    <div className="sheet-scroll">
      <section className="bj-felt">
        <div className="bj-side">
          <div className="bj-who">DEALER</div>
          <div className="bj-cards">
            {(hand?.dealer ?? ['🂠', '🂠']).map((card, i) => (
              <span key={i} className={`bj-card${card === '🂠' ? ' down' : ''}${redSuit(card) ? ' red' : ''}`}>
                {card}
              </span>
            ))}
          </div>
          <div className="bj-total">{hand ? hand.dealerTotal : '—'}</div>
        </div>

        <div className="bj-divider">
          {hand?.settled ? (
            <span className={`bj-verdict${hand.netPositive ? ' won' : ''}`}>
              {hand.outcome} · {hand.net}
            </span>
          ) : playing ? (
            <span className="bj-verdict playing">{hand!.stake} on the table</span>
          ) : (
            <span className="bj-verdict idle">Blackjack pays 3 to 2</span>
          )}
        </div>

        <div className="bj-side">
          <div className="bj-cards">
            {(hand?.you ?? ['🂠', '🂠']).map((card, i) => (
              <span key={i} className={`bj-card${redSuit(card) ? ' red' : ''}`}>
                {card}
              </span>
            ))}
          </div>
          <div className="bj-total">{hand ? hand.yourTotal : '—'}</div>
          <div className="bj-who">YOU</div>
        </div>
      </section>

      {playing ? (
        <div className="bj-actions">
          <button className="bj-act" disabled={busy || !hand!.canHit} onClick={onHit}>
            Hit
          </button>
          <button className="bj-act" disabled={busy || !hand!.canStand} onClick={onStand}>
            Stand
          </button>
          <button className="bj-act" disabled={busy || !hand!.canDouble} onClick={onDouble}>
            Double
          </button>
        </div>
      ) : (
        <>
          <div className="bj-bet">
            <div className="bj-bet-head">
              <span>YOUR BET</span>
              <span className="bj-bet-value">{money(stake)}</span>
            </div>
            <input
              className="bj-slider"
              type="range"
              min={table.minimum}
              max={Math.max(table.minimum, table.maxStake)}
              step={step}
              value={stake}
              disabled={busy || table.maxStake < table.minimum}
              onChange={(event) => setStake(Number(event.target.value))}
            />
            <div className="bj-bet-ends">
              <span>{money(table.minimum)}</span>
              <span>{money(Math.min(table.maximum, table.maxStake))}</span>
            </div>
          </div>

          <button
            className="bj-deal"
            disabled={busy || !!table.locked || stake > table.maxStake || stake < table.minimum}
            onClick={() => onDeal(stake)}
          >
            {hand?.settled ? 'Deal again' : 'Deal'}
          </button>
        </>
      )}

      <section className="bj-books">
        <div className="bj-book">
          <span className="bj-book-label">TONIGHT</span>
          <span className={`bj-book-value${table.sessionCents >= 0 ? ' up' : ' down'}`}>
            {table.session}
          </span>
        </div>
        <div className="bj-book">
          <span className="bj-book-label">A LIFETIME OF THIS</span>
          <span className={`bj-book-value${table.lifetimeCents >= 0 ? ' up' : ' down'}`}>
            {table.lifetime}
          </span>
        </div>
      </section>

      <p className="act-foot">
        {table.locked
          ? `${table.locked}. You have ${table.purse}.`
          : `You have ${table.purse}. The dealer stands on all seventeens.`}
      </p>
    </div>
  );
};

const redSuit = (card: string) => card.includes('♥') || card.includes('♦');
