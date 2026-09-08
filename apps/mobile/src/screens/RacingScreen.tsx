import { useState } from 'react';
import type { RacingView } from '../lib/api';

/**
 * The garage.
 *
 * Three numbers per car and one decision per race: how hard to lean on it.
 * That decision is what the throttle slider in BitLife's version is actually
 * asking, and it is the only part of it that survives being one tap.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
const Bar = ({ label, value }: { label: string; value: number }) => (
  <div className="rc-bar">
    <span className="rc-bar-label">{label}</span>
    <span className="pr-track">
      <span className="pr-fill" style={{ width: `${Math.max(value, 3)}%` }} />
    </span>
    <span className="rc-bar-value">{value}</span>
  </div>
);

const STYLES = [
  { id: 'conserve', label: 'Look after it', note: 'Slower, and it comes home' },
  { id: 'steady', label: 'Race it', note: 'What everybody else is doing' },
  { id: 'push', label: 'Lean on it', note: 'Much quicker. It might not last' },
];

export const RacingScreen = ({
  racing,
  busy,
  onAct,
}: {
  racing: RacingView;
  busy: boolean;
  onAct: (body: { action: 'garage' | 'car' | 'mod' | 'race'; carId?: string; assetId?: string; modId?: string; style?: string }) => void;
}) => {
  const [open, setOpen] = useState<string | null>(racing.cars[0]?.id ?? null);
  const [showroom, setShowroom] = useState(racing.cars.length === 0);

  if (!racing.garage) {
    return (
      <div className="sheet-scroll">
        <p className="esc-rule">
          A unit with a roller door, somewhere to keep a car nobody is insuring. Everything
          else starts here.
        </p>
        <button
          className={`act-row${racing.garageAffordable ? '' : ' locked'}`}
          disabled={!racing.garageAffordable || busy || racing.locked !== null}
          onClick={() => onAct({ action: 'garage' })}
        >
          <span className="act-icon">🏁</span>
          <span className="act-text">
            <span className="act-label">Take the lease</span>
            <span className="act-note">{racing.locked ?? 'You will need a car after this'}</span>
          </span>
          <span className="mk-cost">{racing.garagePrice}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sheet-scroll">
      <section className="panel ry-head">
        <p className="ry-title" style={{ textTransform: 'capitalize' }}>
          {racing.raceClass}
        </p>
        <p className="ry-house">
          {racing.pointsNeeded < 900
            ? `${racing.points} of ${racing.pointsNeeded} points to move up`
            : `${racing.points} points, and nowhere above this`}
        </p>
      </section>

      {racing.cars.map((car) => {
        const expanded = open === car.id;
        return (
          <section className="panel" key={car.id}>
            <button className="pm-head" onClick={() => setOpen(expanded ? null : car.id)}>
              <span className="owned-emoji">{car.emoji}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="owned-label">{car.label}</span>
                <span className="owned-detail">
                  {car.speed} speed · {car.grip} grip · {car.tough} tough
                </span>
              </span>
              <span className="act-chev">{expanded ? '⌄' : '›'}</span>
            </button>

            {expanded && (
              <div className="pm-body">
                <Bar label="Speed" value={car.speed} />
                <Bar label="Grip" value={car.grip} />
                <Bar label="Toughness" value={car.tough} />

                <div className="act-list" style={{ padding: '10px 0 0' }}>
                  {STYLES.map((style) => (
                    <button
                      key={style.id}
                      className={`act-row${racing.racesLeft > 0 && !racing.locked ? '' : ' locked'}`}
                      disabled={racing.racesLeft === 0 || busy || racing.locked !== null}
                      onClick={() => onAct({ action: 'race', assetId: car.id, style: style.id })}
                    >
                      <span className="act-icon">🏎️</span>
                      <span className="act-text">
                        <span className="act-label">{style.label}</span>
                        <span className="act-note">{style.note}</span>
                      </span>
                      <span className="act-chev">›</span>
                    </button>
                  ))}

                  {car.mods.map((mod) => (
                    <button
                      key={mod.id}
                      className={`act-row${mod.owned || !mod.affordable ? ' locked' : ''}`}
                      disabled={mod.owned || !mod.affordable || busy}
                      onClick={() => onAct({ action: 'mod', assetId: car.id, modId: mod.id })}
                    >
                      <span className="act-icon">{mod.emoji}</span>
                      <span className="act-text">
                        <span className="act-label">{mod.label}</span>
                      </span>
                      <span className="mk-cost">{mod.owned ? '✓' : mod.price}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}

      <section className="panel">
        <button className="pm-head" onClick={() => setShowroom(!showroom)}>
          <span className="owned-emoji">🔑</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <span className="owned-label">Buy a car</span>
            <span className="owned-detail">Four of them, and only one wins in gold</span>
          </span>
          <span className="act-chev">{showroom ? '⌄' : '›'}</span>
        </button>

        {showroom && (
          <div className="act-list" style={{ padding: '10px 0 0' }}>
            {racing.forSale.map((car) => (
              <button
                key={car.id}
                className={`act-row${car.affordable ? '' : ' locked'}`}
                disabled={!car.affordable || busy || racing.locked !== null}
                onClick={() => onAct({ action: 'car', carId: car.id })}
              >
                <span className="act-icon">{car.emoji}</span>
                <span className="act-text">
                  <span className="act-label">{car.label}</span>
                  <span className="act-note">
                    {car.speed} speed · {car.grip} grip · {car.tough} tough
                  </span>
                </span>
                <span className="mk-cost">{car.price}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="act-foot">
        {racing.locked ??
          (racing.racesLeft > 0
            ? `${racing.racesLeft} more ${racing.racesLeft === 1 ? 'race' : 'races'} this season.`
            : 'The season is over.')}
      </p>
    </div>
  );
};
