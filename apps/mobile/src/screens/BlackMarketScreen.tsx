import { useState } from 'react';
import type { BlackMarketView } from '../lib/api';

/**
 * Six people who will sell you something.
 *
 * The attitude bar is the whole screen: it is the price, and it is whether the
 * thing is real. Nothing tells you which of the two you are looking at until
 * you try to move it on. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
export const BlackMarketScreen = ({
  market,
  busy,
  onDeal,
}: {
  market: BlackMarketView;
  busy: boolean;
  onDeal: (body: { action: 'buy' | 'haggle' | 'fence'; dealerId?: string; itemId?: string; assetId?: string }) => void;
}) => {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="sheet-scroll">
      <section className="panel">
        <div className="pm-meter">
          <div className="pm-meter-head">
            <span>What the police have noticed</span>
            <span>{market.heatWord}</span>
          </div>
          <div className="pr-track">
            <div
              className="pr-fill"
              style={{
                width: `${Math.max(market.heat, 2)}%`,
                background: market.heat >= 55 ? 'var(--coral)' : market.heat >= 25 ? 'var(--amber)' : 'var(--green)',
              }}
            />
          </div>
        </div>
        <p className="pm-refs" style={{ marginTop: 10 }}>
          They can only take what is in the house. Selling something cools it down.
        </p>
      </section>

      {market.holdings.length > 0 && (
        <section className="panel">
          <div className="eyebrow">IN THE HOUSE</div>
          <div className="act-list" style={{ padding: '6px 0 0' }}>
            {market.holdings.map((item) => (
              <button
                key={item.id}
                className="act-row"
                disabled={busy || market.locked !== null}
                onClick={() => onDeal({ action: 'fence', assetId: item.id })}
              >
                <span className="act-icon">{item.emoji}</span>
                <span className="act-text">
                  <span className="act-label">{item.label}</span>
                  <span className="act-note">Move it on — a fence takes a fence&rsquo;s cut</span>
                </span>
                <span className="mk-cost">{item.value}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {market.dealers.map((dealer) => {
        const expanded = open === dealer.id;
        return (
          <section className="panel" key={dealer.id}>
            <button className="pm-head" onClick={() => setOpen(expanded ? null : dealer.id)}>
              <span className="owned-emoji">{dealer.emoji}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="owned-label">{dealer.name}</span>
                <span className="owned-detail">{dealer.trade}</span>
              </span>
              <span className="act-chev">{expanded ? '⌄' : '›'}</span>
            </button>

            {expanded && (
              <div className="pm-body">
                <div className="pm-meter">
                  <div className="pm-meter-head">
                    <span>How he takes you</span>
                    <span>{dealer.attitudeWord}</span>
                  </div>
                  <div className="pr-track">
                    <div
                      className="pr-fill"
                      style={{
                        width: `${Math.max(dealer.attitude, 2)}%`,
                        background:
                          dealer.attitude >= 55
                            ? 'var(--green)'
                            : dealer.attitude >= 30
                              ? 'var(--amber)'
                              : 'var(--coral)',
                      }}
                    />
                  </div>
                </div>
                <p className="pm-refs" style={{ marginTop: 8 }}>
                  About {dealer.fakeRisk} in a hundred of what he sells you is a copy.
                </p>

                <div className="act-list" style={{ padding: '6px 0 0' }}>
                  {dealer.items.map((item) => (
                    <button
                      key={item.id}
                      className={`act-row${item.affordable && !market.locked ? '' : ' locked'}`}
                      disabled={!item.affordable || busy || market.locked !== null}
                      onClick={() => onDeal({ action: 'buy', dealerId: dealer.id, itemId: item.id })}
                    >
                      <span className="act-icon">{item.emoji}</span>
                      <span className="act-text">
                        <span className="act-label">{item.label}</span>
                      </span>
                      <span className="mk-cost">{item.price}</span>
                    </button>
                  ))}

                  <button
                    className={`act-row${market.locked ? ' locked' : ''}`}
                    disabled={busy || market.locked !== null}
                    onClick={() => onDeal({ action: 'haggle', dealerId: dealer.id })}
                  >
                    <span className="act-icon">🗣️</span>
                    <span className="act-text">
                      <span className="act-label">Argue about the price</span>
                      <span className="act-note">
                        Costs nothing but goodwill, and goodwill is everything here
                      </span>
                    </span>
                    <span className="act-chev">›</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <p className="act-foot">
        {market.locked ?? `${market.dealsLeft} more ${market.dealsLeft === 1 ? 'deal' : 'deals'} this year.`}
      </p>
    </div>
  );
};
