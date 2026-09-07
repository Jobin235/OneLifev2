import type { ActionCard, SchoolView } from '../lib/api';

/**
 * Design 3A and 5A. School is a place with people in it and things to do, not a
 * progress bar you wait out.
 *
 * Grades and popularity are shown side by side deliberately: they pull against
 * each other, and the choice between being top of the class and being liked is
 * most of what school offers a player.
 */
const CLUB_TINTS = [
  { bg: 'var(--green-tint)', fg: 'var(--green-deep)' },
  { bg: 'var(--violet-tint)', fg: 'var(--violet)' },
  { bg: 'var(--blue-tint)', fg: 'var(--blue)' },
  { bg: 'var(--amber-tint)', fg: 'var(--amber-deep)' },
];

export const SchoolScreen = ({
  school,
  busy,
  decisionOpen,
  onAct,
  onOpenPerson,
}: {
  school: SchoolView;
  busy: boolean;
  decisionOpen: boolean;
  onAct: (activityId: string) => void;
  onOpenPerson: (npcId: string) => void;
}) => (
  <>
    <header className="header school-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="screen-title">{school.institution}</h1>
        <div className="screen-sub">{school.yearLine}</div>
      </div>
      <div className="school-avatar">🎒</div>
    </header>

    <div className="scroll" style={{ gap: 20 }}>
      {decisionOpen && (
        <div className="notice">
          <span>👆</span>
          <span>Something is waiting on your answer. Decide first.</span>
        </div>
      )}

      <div className="school-meters">
        <div className="school-meter">
          <div className="school-meter-label">GRADES</div>
          <div className="school-meter-value">{(school.gradePoints / 100).toFixed(1)}</div>
          <div className="school-meter-track">
            <div
              className="school-meter-fill"
              style={{ width: `${school.gradePoints / 4}%`, background: 'var(--violet)' }}
            />
          </div>
        </div>
        <div className="school-meter">
          <div className="school-meter-label">POPULARITY</div>
          <div className="school-meter-value">{school.popularity}</div>
          <div className="school-meter-track">
            <div
              className="school-meter-fill"
              style={{ width: `${school.popularity}%`, background: 'var(--pink)' }}
            />
          </div>
        </div>
      </div>

      {school.debt && <div className="school-debt">{school.debt} in student debt</div>}

      {school.actions.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            WHAT YOU CAN DO
          </div>
          <div className="interaction-grid">
            {school.actions.map((action: ActionCard) => (
              <button
                key={action.id}
                className="interaction"
                disabled={!action.available || busy}
                onClick={() => onAct(action.id)}
                title={action.blockedReason ?? action.note}
              >
                <span className="interaction-icon">{action.icon}</span>
                <span className="interaction-label">{action.label}</span>
                <span className="interaction-note">{action.blockedReason ?? action.note}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {school.subjects.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            YOUR SUBJECTS
          </div>
          <div className="subject-list">
            {school.subjects.map((subject) => (
              <div className="subject" key={subject.name}>
                <span>{subject.name}</span>
                <span className="subject-grade">{subject.grade}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          YOUR CLUBS
        </div>
        <div className="club-row">
          {school.clubs.map((club, index) => {
            const tint = CLUB_TINTS[index % CLUB_TINTS.length]!;
            return (
              <span className="club" key={club} style={{ background: tint.bg, color: tint.fg }}>
                {club}
              </span>
            );
          })}
          {Array.from({ length: Math.max(0, school.clubSlots - school.clubs.length) }).map(
            (_, index) => (
              <span className="club empty" key={`slot-${index}`}>
                + one more slot
              </span>
            ),
          )}
        </div>
      </section>

      {school.classmates.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            YOUR CLASS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {school.classmates.map((person) => (
              <button
                className="person-row small"
                key={person.npcId}
                onClick={() => onOpenPerson(person.npcId)}
              >
                <div className="person-avatar">{person.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="person-name">{person.name}</div>
                  <div className="person-sub">{person.isTeacher ? 'Teacher' : person.note}</div>
                </div>
                <div
                  className="person-score"
                  style={{
                    font: "800 12px/1 var(--text)",
                    color: person.closeness >= 65 ? 'var(--green)' : 'var(--muted)',
                  }}
                >
                  {person.closeness}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  </>
);
