import type { EventInstance, HistoryEntry, LifeState } from '@lineage/shared-types';

/**
 * Spec §45–48, §94–96.
 *
 * The simulation has already decided what happened. This layer only decides how to
 * say it, and it is never allowed to change a number. Note the shape of the
 * interface: every method returns *strings*, so there is no path by which a model's
 * output can become authoritative state.
 */
export interface NarrativeRequest {
  /** Structured facts only — never free text from a model. */
  facts: Record<string, string | number | boolean | null>;
  /** The deterministic fallback, always computed first. */
  fallback: string;
}

export interface NarrativeService {
  eventNarrative(instance: EventInstance, state: LifeState): Promise<string>;
  birthdayRecap(state: LifeState, entries: HistoryEntry[]): Promise<string[]>;
  lifeSummary(state: LifeState): Promise<string>;
  /** Design 4D: push copy written as gossip about your own life. */
  returnNudge(state: LifeState, subject: string): Promise<string>;
}

/**
 * Level 1 and 2 of spec §96: templates, and templates with variables. This is the
 * default implementation and the game is fully playable on it — an AI narrator is
 * strictly an upgrade (§185).
 */
export class TemplateNarrativeService implements NarrativeService {
  async eventNarrative(instance: EventInstance): Promise<string> {
    return instance.outcomeText ?? instance.body;
  }

  /**
   * Design 1B: "It never lists everything that happened — four lines, written like
   * a friend recapping your year." So we take the four most significant entries,
   * in the order they happened.
   */
  async birthdayRecap(_state: LifeState, entries: HistoryEntry[]): Promise<string[]> {
    return [...entries]
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 4)
      .sort((a, b) => a.atAge - b.atAge)
      .map((entry) => entry.line);
  }

  async lifeSummary(state: LifeState): Promise<string> {
    const { character } = state;
    const years = character.deathAge ?? character.age;
    return `${character.firstName} ${character.lastName} lived ${years} years.`;
  }

  async returnNudge(state: LifeState, subject: string): Promise<string> {
    return `${subject} You're ${state.character.age} and something's waiting.`;
  }
}

/**
 * Level 3: a model writes the prose, but only after the outcome is settled, and
 * only through a validator that can reject it (§48, §173). Wired up by the app
 * layer behind the `ai_narrative` feature flag (§120).
 */
export interface NarrativeModel {
  complete(prompt: string, maxTokens: number): Promise<string>;
}

export class ModelNarrativeService implements NarrativeService {
  constructor(
    private readonly model: NarrativeModel,
    private readonly fallback: NarrativeService = new TemplateNarrativeService(),
  ) {}

  async eventNarrative(instance: EventInstance, state: LifeState): Promise<string> {
    const fallback = await this.fallback.eventNarrative(instance, state);
    try {
      const prompt = buildPrompt({
        facts: {
          event: instance.definitionId,
          name: state.character.firstName,
          age: state.character.age,
          choice: instance.chosenChoiceId,
          outcome: instance.outcomeText,
        },
        fallback,
      });
      const written = await this.model.complete(prompt, 160);
      return validateNarrative(written) ?? fallback;
    } catch {
      // Spec §185: if the model is unavailable the game must remain fully playable.
      return fallback;
    }
  }

  async birthdayRecap(state: LifeState, entries: HistoryEntry[]): Promise<string[]> {
    return this.fallback.birthdayRecap(state, entries);
  }

  async lifeSummary(state: LifeState): Promise<string> {
    return this.fallback.lifeSummary(state);
  }

  async returnNudge(state: LifeState, subject: string): Promise<string> {
    return this.fallback.returnNudge(state, subject);
  }
}

const buildPrompt = (request: NarrativeRequest): string =>
  [
    'Rewrite this outcome as one or two sentences of second-person past tense prose.',
    'Do not invent numbers, names, or events. Do not add a moral.',
    `Facts: ${JSON.stringify(request.facts)}`,
    `Baseline: ${request.fallback}`,
  ].join('\n');

/**
 * Anything a model returns is untrusted text. It is length-capped, stripped of
 * markup, and rejected outright if it looks like it is trying to be instructions
 * rather than prose.
 */
export const validateNarrative = (text: string): string | null => {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 10 || cleaned.length > 400) return null;
  if (/[<>{}]|https?:\/\//.test(cleaned)) return null;
  if (/^(system|assistant|user)\b/i.test(cleaned)) return null;
  return cleaned;
};
