import { useEffect, useState } from 'react';
import type { AmenityRow, PropertyRow } from '../lib/api';

/**
 * Property management.
 *
 * Two meters run this, the way BitLife's does: the state of the place, and how
 * the person living in it feels about it. Everything else — the rent, whether
 * they stay, what it is worth — falls out of those two.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
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
          background: value >= 70 ? 'var(--green)' : value >= 40 ? 'var(--amber)' : 'var(--coral)',
        }}
      />
    </div>
  </div>
);

export const PropertyScreen = ({
  properties,
  busy,
  loadAmenities,
  onManage,
}: {
  properties: PropertyRow[];
  busy: boolean;
  loadAmenities: (assetId: string) => Promise<AmenityRow[]>;
  onManage: (assetId: string, action: string, amenityId?: string) => void;
}) => {
  const [open, setOpen] = useState<string | null>(properties[0]?.assetId ?? null);
  const [amenities, setAmenities] = useState<AmenityRow[]>([]);
  const [showAmenities, setShowAmenities] = useState(false);

  // The list is per-property and changes as things get bought.
  useEffect(() => {
    if (!open || !showAmenities) return;
    void loadAmenities(open).then(setAmenities);
  }, [open, showAmenities, loadAmenities, properties]);

  if (properties.length === 0) {
    return <p className="sh-empty">You do not own anywhere somebody could live.</p>;
  }

  return (
    <div className="sheet-scroll">
      {properties.map((property) => {
        const expanded = open === property.assetId;
        return (
          <section className="panel" key={property.assetId}>
            <button
              className="pm-head"
              onClick={() => {
                setOpen(expanded ? null : property.assetId);
                setShowAmenities(false);
              }}
            >
              <span className="owned-emoji">{property.emoji}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="owned-label">{property.label}</span>
                <span className="owned-detail">
                  {property.tenant
                    ? `${property.tenant.name} · ${property.tenant.rent}`
                    : `Empty · would let for ${property.marketRent}`}
                </span>
              </span>
              <span className="shop-price">{property.value}</span>
            </button>

            {expanded && (
              <div className="pm-body">
                <Meter
                  label="Condition"
                  value={property.condition}
                  word={property.conditionWord}
                />
                {property.tenant && (
                  <>
                    <Meter
                      label="Tenant"
                      value={property.tenant.satisfaction}
                      word={property.tenant.satisfactionWord}
                    />
                    <p className="pm-note">
                      {property.tenant.emoji} {property.tenant.name} · {property.tenant.since}
                      {property.tenant.arrears ? ` · ${property.tenant.arrears}` : ''}
                    </p>
                    <p className="pm-refs">{property.tenant.note}</p>
                  </>
                )}

                {property.amenities.length > 0 && (
                  <p className="pm-amenities">{property.amenities.join(' · ')}</p>
                )}

                <div className="act-list" style={{ padding: '6px 0 0' }}>
                  {property.actions.map((action) => (
                    <button
                      key={action.id}
                      className={`act-row${action.available ? '' : ' locked'}`}
                      disabled={!action.available || busy}
                      onClick={() => onManage(property.assetId, action.id)}
                    >
                      <span className="act-text">
                        <span className="act-label">{action.label}</span>
                        <span className="act-note">{action.note}</span>
                      </span>
                      {action.price ? (
                        <span className="mk-cost">{action.price}</span>
                      ) : (
                        <span className="act-chev">›</span>
                      )}
                    </button>
                  ))}

                  <button
                    className="act-row"
                    disabled={busy}
                    onClick={() => setShowAmenities((v) => !v)}
                  >
                    <span className="act-text">
                      <span className="act-label">Put something in</span>
                      <span className="act-note">Raises what it is worth and what it lets for</span>
                    </span>
                    <span className="act-chev">{showAmenities ? '⌄' : '›'}</span>
                  </button>

                  {showAmenities &&
                    amenities.map((amenity) => (
                      <button
                        key={amenity.id}
                        className={`act-row${amenity.available ? '' : ' locked'}`}
                        disabled={!amenity.available || busy}
                        onClick={() => onManage(property.assetId, 'amenity', amenity.id)}
                      >
                        <span className="act-icon">{amenity.emoji}</span>
                        <span className="act-text">
                          <span className="act-label">{amenity.label}</span>
                          <span className="act-note">{amenity.note}</span>
                        </span>
                        <span className="mk-cost">{amenity.owned ? '✓' : amenity.price}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
