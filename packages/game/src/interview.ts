import type { ContentPack } from '@lineage/content';
import type { LifeState } from '@lineage/shared-types';
import { makeRng, type Rng } from '@lineage/simulation';
import { instantiate } from '@lineage/event-engine';
import type { Opening } from './jobs.js';

/**
 * The interview.
 *
 * Applying for a job used to be a hidden dice roll: you tapped a row and either
 * a job appeared or it did not, which is exactly the "jobs happen randomly"
 * the player complained about. BitLife puts a question in the way — an ordinary
 * one, with four answers and no obviously correct choice — and that single beat
 * is what makes the job feel taken rather than handed out.
 *
 * The answer is not the whole story: it shifts the odds, it does not set them.
 * Qualifications still decide most of it, and being turned down is a normal
 * outcome. See docs/BITLIFE-LOOP-SPEC.md §5.
 */

interface Question {
  question: string;
  /** Ordered to match the four choice ids a/b/c/d in `job_interview`. */
  answers: [string, string, string, string];
}

/*
 * Each question's four answers map to fits of 0, +1, -1, +2 in that order — so
 * there is a best answer and a worst one, but nothing on the button tells you
 * which, and a confident wrong answer costs you a job you were qualified for.
 */
const QUESTIONS: Question[] = [
  {
    question: 'What type of work environment do you prefer?',
    answers: [
      'One with great benefits',
      'One with strong leadership',
      'One of micro-management',
      'One with a lot of collaboration',
    ],
  },
  {
    question: 'Do you have any plans for future education?',
    answers: [
      'Only if the company will pay for it',
      'Education never ends',
      'Education is a waste of money',
      "I'm committed to lifelong learning",
    ],
  },
  {
    question: 'Where do you see yourself in five years?',
    answers: [
      'Somewhere warmer',
      'Doing this, but better at it',
      'Running this place',
      'Still here, and further on',
    ],
  },
  {
    question: 'Why are you leaving your current position?',
    answers: [
      'The money, mostly',
      'I want more responsibility',
      'My manager is an idiot',
      'I have gone as far as I can there',
    ],
  },
  {
    question: 'What is your greatest weakness?',
    answers: [
      'I work too hard',
      'I take criticism personally, and I am working on it',
      "I don't really have one",
      'I say yes to too much, so I have started saying no',
    ],
  },
  {
    question: 'How do you handle a deadline you are going to miss?',
    answers: [
      'Work through the night',
      'Tell whoever needs to know, early',
      'Hope nobody notices',
      'Renegotiate the deadline the week before, not the day after',
    ],
  },
  {
    question: 'Tell us about a time you disagreed with a decision.',
    answers: [
      'I kept my head down',
      'I said so once, then got behind it',
      'I was right and I made sure everyone knew',
      'I argued it properly, lost, and did it well anyway',
    ],
  },
];

/** How much an answer moves the odds. Real, but not decisive. */
export const FIT_WEIGHT = 0.11;

/**
 * Puts the interview on screen. The opening rides along in flags rather than in
 * the event definition, so one authored `job_interview` covers every job in the
 * game and the questions can grow without touching the engine.
 */
export const openInterview = (
  state: LifeState,
  opening: Opening,
  content: ContentPack,
  rng: Rng,
): void => {
  const question = rng.pick(QUESTIONS);

  state.flags.interview_track = opening.trackId;
  state.flags.interview_title = opening.title;
  state.flags.interview_employer = opening.employerName;
  state.flags.interview_salary = opening.salaryCents;
  state.flags.interview_chance = Math.round(opening.chance * 100);
  state.flags.interview_question = question.question;
  state.flags.interview_answer_a = question.answers[0];
  state.flags.interview_answer_b = question.answers[1];
  state.flags.interview_answer_c = question.answers[2];
  state.flags.interview_answer_d = question.answers[3];

  /*
   * Placeholders. The outcome text and title are written by the handler once it
   * knows whether they hired you, and the popup re-interpolates them after the
   * deferred effects have run.
   */
  state.flags.interview_result = 'You waited to hear back.';
  state.flags.interview_result_title = 'Interview';
  state.flags.interview_history = 'You interviewed for a job.';

  const definition = content.eventsById.get('job_interview');
  if (!definition) throw new Error('content is missing the job_interview event');

  state.activeEvent = instantiate(
    { definition, bindings: {}, score: 0, scheduled: null },
    state,
    { state, world: null, bindings: {} } as never,
  );
  state.gameState = 'EVENT_AVAILABLE';
};

/**
 * Resolves the application the interview was for. Called from the deferred
 * effect handler, once the player has answered.
 */
export const settleInterview = (
  state: LifeState,
  fit: number,
  content: ContentPack,
  hire: (trackId: string, employerName: string, salary: number) => void,
): void => {
  const trackId = String(state.flags.interview_track ?? '');
  const title = String(state.flags.interview_title ?? 'the job');
  const employer = String(state.flags.interview_employer ?? 'the company');
  const salary = Number(state.flags.interview_salary ?? 0);
  const base = Number(state.flags.interview_chance ?? 0) / 100;

  const rng = makeRng(state.seed, 'interview', trackId, state.character.age, fit);
  const chance = Math.max(0.03, Math.min(0.97, base + fit * FIT_WEIGHT));
  const hired = rng.chance(chance);

  /*
   * The lines go in flags rather than straight into the log. The event's own
   * outcome carries them — `choose` re-interpolates the outcome text and history
   * line once the deferred effects have landed — so the result is written once,
   * by the popup the player is looking at, rather than twice.
   */

  if (hired && content.careersById.has(trackId)) {
    hire(trackId, employer, salary);
    state.flags.interview_result_title = 'Hired';
    state.flags.interview_result = `${employer} called back the same week. You start as ${article(title)} ${title}.`;
    state.flags.interview_history = `You got a job as ${article(title)} ${title} at ${employer}.`;
  } else {
    state.flags.interview_result_title = 'Denied';
    state.flags.interview_result = `You applied for the ${title} position at ${employer}, but never received a call for an interview.`;
    state.flags.interview_history = `You applied to be ${article(title)} ${title} at ${employer} and heard nothing back.`;
  }

  for (const key of [
    'interview_track',
    'interview_title',
    'interview_employer',
    'interview_salary',
    'interview_chance',
    'interview_question',
    'interview_answer_a',
    'interview_answer_b',
    'interview_answer_c',
    'interview_answer_d',
  ]) {
    delete state.flags[key];
  }
};

const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');
