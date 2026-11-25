// The real model client: Anthropic's Messages API through the official SDK, called from the main
// process with the user's own key (PRD section 7, "LLM details"). Nothing else in the app talks
// to a model, and nothing is sent but the plan request and catalog metadata.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { LlmError, type LlmAnswer, type LlmClient, type LlmTurn } from './planGenerator';

/**
 * The answer's shape as sent to the API for structured output. No length or range limits here:
 * the API's schema language has none, and `validatePlanResponse` in core checks everything.
 */
const wireSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string(),
      foundations: z.array(z.number()),
      groups: z.array(z.object({ name: z.string(), description: z.string(), problems: z.array(z.number()) })),
      challenge: z.array(z.number()),
    }),
  ),
});

/** Opt-in beta: if the model declines, the API may retry on a fallback model in the same call. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Enough for the largest plan (four topics of thirty problems) several times over. */
const MAX_TOKENS = 16000;

type StopReason = string | null;

function toAnswer(stopReason: StopReason, text: string, explanation: string | null, model: string): LlmAnswer {
  if (stopReason === 'refusal') return { kind: 'refused', explanation };
  if (stopReason === 'max_tokens') return { kind: 'truncated' };
  try {
    return { kind: 'json', value: JSON.parse(text) as unknown, text, model };
  } catch {
    return { kind: 'unparseable', text };
  }
}

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('');
}

/** Turns an SDK error into one the user can act on. Never includes the key. */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new LlmError('bad_key', 'Anthropic did not accept the API key. Check it in Settings.');
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('no_access', 'This API key is not allowed to use that model. Pick another model in Settings.');
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new LlmError('bad_model', 'Anthropic does not know that model. Pick another model in Settings.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmError('rate_limited', 'Anthropic is limiting requests for this key right now. Wait a minute and try again.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmError('offline', 'Could not reach Anthropic. Check your connection and try again.');
  }
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === 'number' ? error.status : 0;
    if (status >= 500) return new LlmError('unavailable', 'Anthropic is having trouble right now. Try again in a few minutes.');
    return new LlmError('other', `Anthropic did not accept the request (${status || 'error'}). Try another model in Settings.`);
  }
  return new LlmError('other', 'The request to Anthropic failed. Try again.');
}

/** How long one request may take. A plan is one answer of a few thousand tokens. */
const REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

export interface AnthropicClientOptions {
  /** Tests answer requests themselves instead of reaching the network. */
  fetch?: typeof globalThis.fetch;
  /** How often the SDK repeats a request that failed for a passing reason. */
  maxRetries?: number;
}

function newSdkClient(apiKey: string, options: AnthropicClientOptions): Anthropic {
  return new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? 1,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

/** A client for one API key. The key lives only in this object, for the life of one request. */
export function createAnthropicClient(apiKey: string, options: AnthropicClientOptions = {}): LlmClient {
  const client = newSdkClient(apiKey, options);
  const messages = (turns: readonly LlmTurn[]): { role: 'user' | 'assistant'; content: string }[] =>
    turns.map((turn) => ({ role: turn.role, content: turn.text }));

  return {
    async complete({ model, system, turns }) {
      try {
        try {
          // `create`, not the SDK's `parse`: `parse` throws on an answer that is cut off or is not
          // JSON, and those are answers this app handles itself (see `toAnswer`).
          const response = await client.beta.messages.create({
            model,
            max_tokens: MAX_TOKENS,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            system,
            messages: messages(turns),
            output_config: { format: betaZodOutputFormat(wireSchema) },
          });
          return toAnswer(response.stop_reason, textOf(response.content), response.stop_details?.explanation ?? null, response.model);
        } catch (error) {
          // The fallback option is a dated beta. If the API no longer accepts it, or this model
          // does not take it, ask again the plain way rather than fail a request that would work.
          if (!(error instanceof Anthropic.BadRequestError)) throw error;
        }
        const response = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: messages(turns),
          output_config: { format: zodOutputFormat(wireSchema) },
        });
        return toAnswer(response.stop_reason, textOf(response.content), response.stop_details?.explanation ?? null, response.model);
      } catch (error) {
        throw toLlmError(error);
      }
    },
  };
}

/** Checks a key by asking for the model list, which costs nothing. Returns the model IDs. */
export async function listModels(apiKey: string, options: AnthropicClientOptions = {}): Promise<string[]> {
  try {
    const client = newSdkClient(apiKey, options);
    const ids: string[] = [];
    for await (const model of client.models.list()) ids.push(model.id);
    return ids;
  } catch (error) {
    throw toLlmError(error);
  }
}
