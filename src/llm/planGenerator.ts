// Plan generation (PRD section 7, steps 4 and 5): send the candidates to the model, check the
// answer, retry once with the errors, and return either a plan made only of candidate problems
// or a plain error. The model is reached through a small seam so tests use saved answers.
import {
  validatePlanResponse,
  type PlanCandidate,
  type PlanItemDraft,
  type PlanRequest,
} from '../core/plan';
import type { TopicId } from '../core/topics';
import { buildPlanMessage, buildRetryMessage, PLAN_SYSTEM_PROMPT } from './prompt';

/** One turn of the conversation with the model. */
export interface LlmTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** What came back from one request. */
export type LlmAnswer =
  /**
   * The model's answer, parsed as JSON. `text` is the answer as sent, for a retry. `model` is the
   * model that wrote it when the client knows: it differs from the one asked for when the API
   * served the request with a fallback model.
   */
  | { kind: 'json'; value: unknown; text: string; model?: string }
  /** The answer was not valid JSON at all. */
  | { kind: 'unparseable'; text: string }
  /** The model declined to answer. */
  | { kind: 'refused'; explanation: string | null }
  /** The answer was cut off by the length limit. */
  | { kind: 'truncated' };

/** The model, as plan generation sees it. Throws `LlmError` when the request itself fails. */
export interface LlmClient {
  complete(input: { model: string; system: string; turns: readonly LlmTurn[] }): Promise<LlmAnswer>;
}

export type LlmErrorKind = 'no_key' | 'bad_key' | 'no_access' | 'rate_limited' | 'offline' | 'unavailable' | 'bad_model' | 'other';

/** A failed request, in terms the user can act on. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export type PlanFailure = 'invalid' | 'refused' | 'truncated';

/** The model answered, twice if needed, and no usable plan came out. */
export class PlanGenerationError extends Error {
  constructor(
    readonly kind: PlanFailure,
    message: string,
    /** What was wrong with the last answer, for the log. Never shown raw to the user. */
    readonly problems: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PlanGenerationError';
  }
}

export interface GeneratedPlan {
  items: PlanItemDraft[];
  /** 1 when the first answer passed, 2 when the retry did. */
  attempts: number;
  /** The model that wrote the accepted answer. */
  model: string;
}

const MAX_ATTEMPTS = 2;

/**
 * Asks the model for a plan and returns it only if every problem in it is one of the candidates
 * it was shown. One retry with the errors; then a plain error.
 */
export async function generatePlan(
  client: LlmClient,
  model: string,
  request: PlanRequest,
  candidates: ReadonlyMap<TopicId, readonly PlanCandidate[]>,
): Promise<GeneratedPlan> {
  const turns: LlmTurn[] = [{ role: 'user', text: buildPlanMessage(request, candidates) }];
  let problems: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const answer = await client.complete({ model, system: PLAN_SYSTEM_PROMPT, turns });
    if (answer.kind === 'refused') {
      throw new PlanGenerationError('refused', 'The model declined to write this plan. Try again, or try different topics.');
    }
    if (answer.kind === 'truncated') {
      throw new PlanGenerationError('truncated', 'The plan came back cut off. Try again with fewer topics or a smaller size.');
    }
    if (answer.kind === 'unparseable' && answer.text.trim() === '') {
      // Nothing to send back for a retry: an empty turn would be refused by the API with a
      // message about the request, not about the answer.
      throw new PlanGenerationError('invalid', 'The model sent back an empty answer. Nothing was saved. Try again.');
    }
    if (answer.kind === 'unparseable') {
      problems = ['The answer was not valid JSON in the required shape.'];
    } else {
      const checked = validatePlanResponse(answer.value, request, candidates);
      if (checked.ok) return { items: checked.items, attempts: attempt, model: answer.model ?? model };
      problems = checked.errors;
    }
    turns.push({ role: 'assistant', text: answer.text }, { role: 'user', text: buildRetryMessage(problems) });
  }

  throw new PlanGenerationError(
    'invalid',
    'The model did not produce a usable plan, even after one retry. Nothing was saved. Try again.',
    problems,
  );
}
