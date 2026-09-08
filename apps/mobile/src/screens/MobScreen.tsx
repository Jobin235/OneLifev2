import type { MobView } from '../lib/api';

/**
 * The family.
 *
 * A career screen for a career with no application form: the rank, what it is
 * worth as a percentage, and the short list of things somebody at that rank
 * gets asked to do. The one number that matters is the cut — it is the reason
 * to climb, and BitLife's figures.
 */
export const MobScreen = ({
  mob,
  busy,
  decisionOpen,
  onJob,
}: {
  mob: MobView;
  busy: boolean;
  decisionOpen: boolean;
  onJob: (job: string) => void;
}) => {
  const colour =
    mob.standing >= 55 ? 'var(--green)' : mob.standing >= 25 ? 'var(--amber)' : 'var(--coral)';

  return (
    <div className="sheet-scroll">
      <section className="panel ry-head">
        <p className="ry-title">{mob.title}</p>
        <p className="ry-house">
          {mob.family} · {mob.made ? 'made' : 'not made'}
        </p>

        <div className="pm-meter" style={{ marginTop: 14 }}>
          <div className="pm-meter-head">
            <span>Standing</span>
            <span>{mob.standingWord}</span>
          </div>
          <div className="pr-track">
            <div
              className="pr-fill"
              style={{ width: `${Math.max(mob.standing, 2)}%`, background: colour }}
            />
          </div>
        </div>

        <div className="fm-figures" style={{ marginTop: 12 }}>
          <span>{mob.cutLine}</span>
          <span>
            <b>{mob.earned}</b> brought in
          </span>
        </div>
        {mob.next && <p className="pm-refs" style={{ marginTop: 8 }}>Next rung: {mob.next}.</p>}
      </section>

      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      <div className="act-list">
        {mob.jobs.map((job) => (
          <button
            key={job.id}
            className={`act-row${job.available ? '' : ' locked'}`}
            disabled={!job.available || busy || decisionOpen}
            onClick={() => onJob(job.id)}
          >
            <span className="act-icon">{job.icon}</span>
            <span className="act-text">
              <span className="act-label">{job.label}</span>
              <span className="act-note">{job.locked ?? job.note}</span>
            </span>
            {job.available ? <span className="act-chev">›</span> : <span className="act-lock">🔒</span>}
          </button>
        ))}
      </div>

      <p className="act-foot">
        {mob.jobsLeft > 0
          ? `${mob.jobsLeft} more ${mob.jobsLeft === 1 ? 'job' : 'jobs'} this year. A quiet year is noticed too.`
          : 'That is enough for one year. Doing nothing next year will be noticed.'}
      </p>
    </div>
  );
};
