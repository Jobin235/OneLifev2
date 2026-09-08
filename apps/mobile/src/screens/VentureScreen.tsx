import { useState } from 'react';
import type { VentureOffer, VentureView } from '../lib/api';

/**
 * Things you own and run: a commune, a zoo, an agency.
 *
 * One screen for all three, because they are one machine wearing three sets of
 * nouns — the words come out of the content pack, so a cult says "Devotion"
 * and "followers" where a zoo says "Welfare" and "animals" and nothing here
 * knows the difference. See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
const Meter = ({ label, value, word }: { label: string; value: number; word: string }) => (
  <div className="pm-meter">
    <div className="pm-meter-head">
      <span>{label}</span>
      <span>{word}</span>
    </div>
    <div className="pr-track">
      <div
        className="pr-fill"
        style={{
          width: `${Math.max(value, 2)}%`,
          background: value >= 60 ? 'var(--green)' : value >= 35 ? 'var(--amber)' : 'var(--coral)',
        }}
      />
    </div>
  </div>
);

export const VentureScreen = ({
  ventures,
  offers,
  busy,
  decisionOpen,
  onStart,
  onAct,
  onUpgrade,
}: {
  ventures: VentureView[];
  offers: VentureOffer[];
  busy: boolean;
  decisionOpen: boolean;
  onStart: (kind: string, tierId: string) => void;
  onAct: (ventureId: string, actionId: string) => void;
  onUpgrade: (ventureId: string, upgradeId: string) => void;
}) => {
  const [open, setOpen] = useState<string | null>(ventures[0]?.id ?? null);
  const [building, setBuilding] = useState<string | null>(null);
  const [shopping, setShopping] = useState<string | null>(null);

  return (
    <div className="sheet-scroll">
      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      {ventures.map((venture) => {
        const expanded = open === venture.id;
        return (
          <section className="panel" key={venture.id}>
            <button
              className="pm-head"
              onClick={() => {
                setOpen(expanded ? null : venture.id);
                setBuilding(null);
              }}
            >
              <span className="owned-emoji">{venture.emoji}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="owned-label">{venture.name}</span>
                <span className="owned-detail">
                  {venture.members.length}/{venture.capacity} {venture.memberWordPlural} ·{' '}
                  {venture.lastYear}
                </span>
              </span>
              <span className="act-chev">{expanded ? '⌄' : '›'}</span>
            </button>

            {expanded && (
              <div className="pm-body">
                <Meter
                  label={venture.moraleWord}
                  value={venture.morale}
                  word={venture.moraleLabel}
                />
                <Meter
                  label={venture.appealWord}
                  value={venture.appeal}
                  word={venture.premises}
                />

                {venture.members.length > 0 && (
                  <>
                    <button
                      className="ven-roster"
                      onClick={() => setShopping(shopping === venture.id ? null : venture.id)}
                    >
                      {venture.members
                        .slice(0, 14)
                        .map((m) => m.emoji)
                        .join(' ')}
                      {venture.members.length > 14 ? ` +${venture.members.length - 14}` : ''}
                    </button>
                    {shopping === venture.id && (
                      <div className="ven-list">
                        {venture.members.map((m) => (
                          <div className="ven-row" key={m.id}>
                            <span>
                              {m.emoji} {m.label}
                            </span>
                            <span className="ven-q">{m.quality}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div className="act-list" style={{ padding: '6px 0 0' }}>
                  {venture.actions.map((action) => (
                    <button
                      key={action.id}
                      className={`act-row${action.available ? '' : ' locked'}`}
                      disabled={!action.available || busy || decisionOpen}
                      onClick={() => onAct(venture.id, action.id)}
                    >
                      <span className="act-icon">{action.emoji}</span>
                      <span className="act-text">
                        <span className="act-label">{action.label}</span>
                        <span className="act-note">{action.locked ?? action.note}</span>
                      </span>
                      {action.price ? (
                        <span className="mk-cost">{action.price}</span>
                      ) : action.available ? (
                        <span className="act-chev">›</span>
                      ) : (
                        <span className="act-lock">🔒</span>
                      )}
                    </button>
                  ))}

                  <button
                    className="act-row"
                    disabled={busy}
                    onClick={() => setBuilding(building === venture.id ? null : venture.id)}
                  >
                    <span className="act-icon">🔨</span>
                    <span className="act-text">
                      <span className="act-label">Build something</span>
                      <span className="act-note">
                        Raises {venture.appealWord.toLowerCase()}, which is what brings the
                        better sort
                      </span>
                    </span>
                    <span className="act-chev">{building === venture.id ? '⌄' : '›'}</span>
                  </button>

                  {building === venture.id &&
                    venture.upgrades.map((upgrade) => (
                      <button
                        key={upgrade.id}
                        className={`act-row${upgrade.owned || !upgrade.affordable ? ' locked' : ''}`}
                        disabled={upgrade.owned || !upgrade.affordable || busy}
                        onClick={() => onUpgrade(venture.id, upgrade.id)}
                      >
                        <span className="act-icon">{upgrade.emoji}</span>
                        <span className="act-text">
                          <span className="act-label">{upgrade.label}</span>
                        </span>
                        <span className="mk-cost">{upgrade.owned ? '✓' : upgrade.price}</span>
                      </button>
                    ))}
                </div>

                <p className="act-foot" style={{ padding: '14px 0 0' }}>
                  {venture.actionsLeft > 0
                    ? `${venture.actionsLeft} more this year.`
                    : 'That is enough for one year.'}
                </p>
              </div>
            )}
          </section>
        );
      })}

      {offers
        .filter((offer) => !offer.owned)
        .map((offer) => (
          <section className="panel" key={offer.kind}>
            <button
              className="pm-head"
              onClick={() => setOpen(open === offer.kind ? null : offer.kind)}
            >
              <span className="owned-emoji">{offer.emoji}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="owned-label">{offer.label}</span>
                <span className="owned-detail">{offer.buyLabel}</span>
              </span>
              <span className="act-chev">{open === offer.kind ? '⌄' : '›'}</span>
            </button>

            {open === offer.kind && (
              <div className="act-list" style={{ padding: '10px 0 0' }}>
                {offer.tiers.map((tier) => (
                  <button
                    key={tier.id}
                    className={`act-row${tier.affordable ? '' : ' locked'}`}
                    disabled={!tier.affordable || busy || decisionOpen}
                    onClick={() => onStart(offer.kind, tier.id)}
                  >
                    <span className="act-text">
                      <span className="act-label">{tier.label}</span>
                      <span className="act-note">Room for {tier.capacity}</span>
                    </span>
                    <span className="mk-cost">{tier.price}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
    </div>
  );
};
