import { useState } from 'react';
import type { MoneyView, ShopEntry } from '../lib/api';

/**
 * Design 3C. Money in plain language — "what you own", "every month" — with a
 * human-cost note at the bottom instead of a chart. No candlesticks anywhere.
 */
export const MoneyScreen = ({
  money,
  busy,
  onBuy,
  onSell,
}: {
  money: MoneyView;
  busy: boolean;
  onBuy: (purchasableId: string) => void;
  onSell: (assetId: string) => void;
}) => {
  const [shopOpen, setShopOpen] = useState(false);

  return (
  <>
    <header className="header">
      <h1 className="screen-title">Money</h1>
      <div className="screen-sub">What you're worth, and where it goes</div>
    </header>

    <div className="scroll" style={{ gap: 18 }}>
      <section className="panel">
        <div className="eyebrow">WHAT YOU'RE WORTH</div>
        <div className="big-figure" style={{ marginTop: 10 }}>
          {money.netWorth}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          <span
            style={{
              font: "700 13px/1 var(--text)",
              color: money.monthlyNet.startsWith('+') ? 'var(--green)' : 'var(--coral)',
            }}
          >
            {money.monthlyNet} / mo
          </span>
          {money.debtCount > 0 && (
            <span style={{ font: "700 13px/1 var(--text)", color: 'var(--muted)' }}>
              {money.debtCount} debt{money.debtCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </section>

      {money.owned.length > 0 && (
        <section className="panel">
          <div className="eyebrow">WHAT YOU OWN</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {money.owned.map((item, index) => (
              <div className="owned-row" key={index}>
                <span className="owned-emoji">{item.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="owned-label">{item.label}</div>
                  <div className="owned-detail">{item.detail}</div>
                </div>
                {/* A business is closed rather than sold, so it has no id here. */}
                {item.assetId && (
                  <button
                    className="sell"
                    disabled={busy}
                    onClick={() => onSell(item.assetId!)}
                  >
                    Sell
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {money.forSale.length > 0 && (
        <section className="panel">
          <button className="shop-toggle" onClick={() => setShopOpen((open) => !open)}>
            <span className="eyebrow">BUY SOMETHING</span>
            <span className="shop-chevron">{shopOpen ? '−' : '+'}</span>
          </button>

          {shopOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
              {money.forSale.map((item: ShopEntry) => (
                <button
                  className="shop-row"
                  key={item.id}
                  disabled={!item.available || busy}
                  onClick={() => onBuy(item.id)}
                >
                  <span className="owned-emoji">{item.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span className="owned-label">{item.label}</span>
                    {/* The upkeep is the half of the decision people forget. */}
                    <span className="owned-detail">
                      {item.blockedReason ?? item.upkeep}
                    </span>
                  </span>
                  <span className="shop-price">{item.price}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {money.monthly.length > 0 && (
        <section className="panel">
          <div className="eyebrow">EVERY MONTH</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
            {money.monthly.map((line, index) => (
              <div className="money-line" key={index}>
                <span>
                  {line.icon} {line.label}
                </span>
                <span
                  className="amount"
                  style={{ color: line.positive ? 'var(--green)' : 'var(--coral)' }}
                >
                  {line.amount}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {money.note && (
        <div
          className="panel"
          style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: 'var(--amber-tint)', border: 0 }}
        >
          <span style={{ fontSize: 18, lineHeight: 1.1, flex: 'none' }}>⚠️</span>
          <span
            style={{
              font: "600 13.5px/1.55 var(--text)",
              color: 'var(--amber-deep)',
              textWrap: 'pretty',
            }}
          >
            {money.note}
          </span>
        </div>
      )}
    </div>
  </>
);
};
