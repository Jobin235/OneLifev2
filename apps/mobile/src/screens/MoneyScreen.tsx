import { useState } from 'react';
import type { DebtLine, MoneyView, ShopEntry } from '../lib/api';

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
  onBuy: (purchasableId: string, onFinance: boolean) => void;
  onSell: (assetId: string) => void;
}) => {
  /*
   * Open. The shop was behind a "+" and stayed shut, which on a screen the
   * player opens to spend money is the wrong default — BitLife's equivalents
   * are lists you land in, not accordions you have to find.
   */
  const [shopOpen, setShopOpen] = useState(true);

  return (
    <div className="sheet-scroll">
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

      {money.debts.length > 0 && (
        <section className="panel">
          <div className="eyebrow">WHAT YOU OWE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {money.debts.map((debt: DebtLine) => (
              <div className="debt-row" key={debt.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="owned-label">{debt.label}</div>
                  {/* The whole point: who wants it back, and what it is costing. */}
                  <div className="owned-detail">
                    To {debt.holder} · {debt.rate} · since you were {debt.sinceAge}
                  </div>
                </div>
                <span className="debt-balance">{debt.balance}</span>
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
                <div className="shop-item" key={item.id}>
                  <div className="shop-head">
                    <span className="owned-emoji">{item.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="owned-label">{item.label}</span>
                      {/* The upkeep is the half of the decision people forget. */}
                      <span className="owned-detail">{item.upkeep}</span>
                    </span>
                    <span className="shop-price">{item.price}</span>
                  </div>
                  {/*
                    Two ways to buy, because there are two ways to buy: the whole
                    price today, or a deposit and twenty-five years of payments.
                    Only offering the first meant the shop was empty for most of
                    most lives — the cheapest house is eleven years of wages.
                  */}
                  <div className="shop-buttons">
                    <button
                      className="shop-buy"
                      disabled={!item.available || busy}
                      onClick={() => onBuy(item.id, false)}
                    >
                      {item.available ? `Pay ${item.price}` : (item.blockedReason ?? 'Not available')}
                    </button>
                    {item.finance.terms !== 'Cash only' && (
                      <button
                        className="shop-buy finance"
                        disabled={!item.finance.available || busy}
                        onClick={() => onBuy(item.id, true)}
                      >
                        {item.finance.available
                          ? item.finance.terms
                          : (item.finance.blockedReason ?? 'No credit')}
                      </button>
                    )}
                  </div>
                </div>
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
  );
};
