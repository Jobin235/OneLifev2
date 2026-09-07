import { useState } from 'react';
import type { MarketView, StockRow } from '../lib/api';

/**
 * The market.
 *
 * A row states the price, what it did last year, and how risky it is — before
 * you buy, not after. The risk bar is the promise the tuning has to keep: high
 * risk means a wide spread of outcomes, not a slow guaranteed loss.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
export const MarketScreen = ({
  market,
  busy,
  onTrade,
}: {
  market: MarketView;
  busy: boolean;
  onTrade: (stockId: string, shares: number, sell: boolean) => void;
}) => {
  const [open, setOpen] = useState<string | null>(null);
  const [shares, setShares] = useState(10);

  const row = (stock: StockRow) => {
    const expanded = open === stock.id;
    return (
      <div key={stock.id} className={`mk-row${expanded ? ' open' : ''}`}>
        <button
          className="mk-head"
          onClick={() => {
            setOpen(expanded ? null : stock.id);
            setShares(10);
          }}
        >
          <span className="mk-ticker">{stock.ticker}</span>
          <span className="mk-name">
            <span className="mk-title">{stock.name}</span>
            <span className="mk-sub">
              {stock.shares > 0 ? `${stock.shares} shares · ${stock.holdingValue}` : stock.blurb}
            </span>
          </span>
          <span className="mk-figures">
            <span className="mk-price">{stock.price}</span>
            <span className={`mk-change${stock.up ? ' up' : ' down'}`}>{stock.change}</span>
          </span>
        </button>

        {expanded && (
          <div className="mk-detail">
            <div className="mk-risk">
              <span className="mk-risk-label">Risk</span>
              <span className="mk-risk-track">
                <span
                  className={`mk-risk-fill ${stock.risk}`}
                  style={{ width: `${stock.riskBar}%` }}
                />
              </span>
              <span className="mk-risk-word">{stock.risk}</span>
            </div>

            {stock.shares > 0 && (
              <p className={`mk-gain${stock.gainUp ? ' up' : ' down'}`}>
                {stock.gain} on what you paid
              </p>
            )}

            <label className="mk-shares">
              <span>Shares</span>
              <input
                type="number"
                min={1}
                value={shares}
                onChange={(e) => setShares(Math.max(1, Number(e.target.value) || 1))}
              />
              <span className="mk-cost">
                ${Math.round((stock.priceCents * shares) / 100).toLocaleString('en-US')}
              </span>
            </label>

            <div className="mk-buttons">
              <button
                className="shop-buy"
                disabled={busy || !stock.affordable}
                onClick={() => onTrade(stock.id, shares, false)}
              >
                {stock.affordable ? 'Buy' : "Can't afford one"}
              </button>
              <button
                className="shop-buy finance"
                disabled={busy || stock.shares < 1}
                onClick={() => onTrade(stock.id, Math.min(shares, stock.shares), true)}
              >
                {stock.shares > 0 ? 'Sell' : 'Nothing to sell'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const held = market.rows.filter((r) => r.shares > 0);
  const rest = market.rows.filter((r) => r.shares === 0);

  return (
    <div className="sheet-scroll">
      <section className="panel">
        <div className="eyebrow">WHAT YOUR SHARES ARE WORTH</div>
        <div className="big-figure" style={{ marginTop: 10 }}>
          {market.total}
        </div>
        <div className="mk-basis">{market.invested} put in</div>
      </section>

      {held.length > 0 && (
        <section>
          <h3 className="act-group">Holding</h3>
          {held.map(row)}
        </section>
      )}

      <section>
        <h3 className="act-group">{held.length > 0 ? 'The rest of the market' : 'The market'}</h3>
        {rest.map(row)}
      </section>
    </div>
  );
};
