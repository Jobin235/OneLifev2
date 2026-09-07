import type { Opening } from '../lib/api';

/**
 * Looking for work.
 *
 * Every opening states what it wants *before* you apply, and says plainly which
 * single thing is standing in your way. This screen is the answer to "why did I
 * randomly get a job": you did not, you applied for this one, and your smarts
 * were the reason the other one said no.
 */
export const JobsScreen = ({
  openings,
  applicationsLeft,
  busy,
  decisionOpen,
  onApply,
}: {
  openings: Opening[];
  applicationsLeft: number;
  busy: boolean;
  decisionOpen: boolean;
  onApply: (trackId: string) => void;
}) => (
  <>
    <header className="header">
      <h1 className="screen-title">Looking for work</h1>
      <div className="screen-sub">
        {applicationsLeft > 0
          ? `${applicationsLeft} application${applicationsLeft === 1 ? '' : 's'} left this year`
          : 'You have applied for enough this year'}
      </div>
    </header>

    <div className="scroll" style={{ gap: 10 }}>
      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      {openings.length === 0 && (
        <div className="quiet">
          <div style={{ fontSize: 24, lineHeight: 1 }}>📭</div>
          <div className="quiet-title">Nothing going.</div>
          <div className="quiet-text">Try again next year, or go and learn something.</div>
        </div>
      )}

      {openings.map((job) => (
        <button
          className="opening"
          key={job.trackId}
          disabled={!job.qualified || busy || decisionOpen || applicationsLeft === 0}
          onClick={() => onApply(job.trackId)}
        >
          <span className="opening-top">
            <span style={{ minWidth: 0 }}>
              <span className="opening-title">{job.title}</span>
              <span className="opening-where">{job.employer}</span>
            </span>
            <span className="opening-salary">{job.salary}</span>
          </span>

          <span className="opening-req">
            {job.requirements.map((req) => (
              <span className="req" key={req}>
                {req}
              </span>
            ))}
          </span>

          {job.missing ? (
            <span className="opening-missing">{job.missing}</span>
          ) : (
            <span className="opening-odds">
              {job.chance >= 0.75
                ? 'You are a strong candidate'
                : job.chance >= 0.55
                  ? 'You have a fair shot'
                  : 'It would be a stretch'}
            </span>
          )}
        </button>
      ))}
    </div>
  </>
);
