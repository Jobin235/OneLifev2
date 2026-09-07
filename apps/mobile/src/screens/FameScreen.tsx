import type { FameView } from '../lib/api';

/**
 * Being known.
 *
 * Two halves, because fame has two halves: the account you own outright and
 * grow by turning up, and the rooms you have to be let into. BitLife splits
 * these the same way — social media is a thing you do, casting is a thing that
 * happens to you — and the second half is where the refusals live.
 * See docs/BITLIFE-SYSTEMS-RESEARCH.md.
 */
const Split = ({ fans, haters }: { fans: number; haters: number }) => {
  const known = Math.max(1, fans + haters);
  return (
    <div className="fm-split">
      <div className="pr-track">
        <div className="pr-fill" style={{ width: `${(fans / known) * 100}%`, background: 'var(--green)' }} />
      </div>
      <div className="fm-split-legend">
        <span>{fans}% like you</span>
        <span>{haters}% do not</span>
      </div>
    </div>
  );
};

export const FameScreen = ({
  fame,
  busy,
  decisionOpen,
  onAudition,
}: {
  fame: FameView;
  busy: boolean;
  decisionOpen: boolean;
  onAudition: (trackId: string) => void;
}) => (
  <div className="sheet-scroll">
    <section className="panel fm-head">
      <p className="fm-line">{fame.line}</p>
      <div className="fm-figures">
        <span>
          <b>{fame.followingShort}</b> following
        </span>
        <span>
          <b>{fame.reach}</b> knows you
        </span>
        {fame.knownFor && (
          <span>
            for <b>{fame.knownFor}</b>
          </span>
        )}
      </div>
      {fame.following > 0 && <Split fans={fame.fans} haters={fame.haters} />}
      {fame.posting.streak > 1 && (
        <p className="pm-refs">
          You have posted {fame.posting.streak} years running. Stopping costs more than starting did.
        </p>
      )}
      {fame.posting.locked && <p className="pm-refs">{fame.posting.locked}.</p>}
    </section>

    <h3 className="act-group">Casting</h3>
    {decisionOpen && (
      <div className="notice">
        <span>👆</span>
        <span>Something is waiting on your answer. Decide first.</span>
      </div>
    )}

    <div className="act-list">
      {fame.auditions.map((row) => {
        const blocked = !row.qualified || fame.auditionsLeft === 0 || decisionOpen;
        return (
          <button
            key={row.trackId}
            className={`act-row${row.qualified ? '' : ' locked'}`}
            disabled={blocked || busy}
            onClick={() => onAudition(row.trackId)}
          >
            <span className="act-text">
              <span className="act-label">
                {row.label} · {row.startsAs}
              </span>
              <span className="act-note">
                {row.qualified ? row.requirements.join(' · ') : row.missing}
              </span>
            </span>
            {row.qualified ? (
              <span className="act-left">{row.chance}%</span>
            ) : (
              <span className="act-lock">🔒</span>
            )}
          </button>
        );
      })}
    </div>

    <p className="act-foot">
      {fame.auditionsLeft > 0
        ? `You can go up for ${fame.auditionsLeft} more thing${fame.auditionsLeft === 1 ? '' : 's'} this year. Most of them will say no.`
        : 'You have been up for enough this year. Try again after your birthday.'}
    </p>
  </div>
);
