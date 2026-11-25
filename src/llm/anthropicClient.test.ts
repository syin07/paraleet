// The real model client against a fake network: what is sent to Anthropic, and how each kind of
// answer and failure comes back. No request leaves the machine.
import { describe, expect, it } from 'vitest';
import { createAnthropicClient, listModels } from './anthropicClient';
import { LlmError } from './planGenerator';

const KEY = 'sk-ant-test-key-000000';

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

type Reply = { status: number; body: unknown } | Error;

/** A `fetch` that answers from a list and records what it was asked. */
function fakeNetwork(replies: Reply[]): { fetch: typeof globalThis.fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const text = request.method === 'GET' ? '' : await request.text();
    seen.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    });
    const reply = replies.shift();
    if (reply === undefined) throw new Error('The fake network was asked more often than expected');
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, seen };
}

function message(text: string, stopReason = 'end_turn', extra: Record<string, unknown> = {}): Reply {
  return {
    status: 200,
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
      ...extra,
    },
  };
}

const apiError = (status: number, type: string): Reply => ({
  status,
  body: { type: 'error', error: { type, message: `details that may mention ${KEY}` } },
});

const ask = (network: { fetch: typeof globalThis.fetch }) =>
  createAnthropicClient(KEY, { fetch: network.fetch, maxRetries: 0 }).complete({
    model: 'claude-opus-5-5',
    system: 'You build study plans.',
    turns: [{ role: 'user', text: 'Candidates: 1 | LeetCode | Easy | Two Sum' }],
  });

/** The header that carries the key. Which one is the SDK's business; that there is one is ours. */
const keyHeader = (sent: Seen): string => sent.headers['x-api-key'] ?? sent.headers['authorization'] ?? '';

const plan = { topics: [{ topic: 'binary-search', foundations: [1, 2, 3], groups: [], challenge: [] }] };

describe('what is sent', () => {
  it('asks for structured output, opts into the refusal fallback, and sends nothing it should not', async () => {
    const network = fakeNetwork([message(JSON.stringify(plan))]);
    await ask(network);
    expect(network.seen).toHaveLength(1);
    const sent = network.seen[0]!;
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/v1/messages');
    expect(new URL(sent.url).host).toBe('api.anthropic.com');
    expect(keyHeader(sent)).toContain(KEY);
    expect(sent.url).not.toContain(KEY);
    expect(sent.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(sent.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      fallbacks: 'default',
      system: 'You build study plans.',
      messages: [{ role: 'user', content: 'Candidates: 1 | LeetCode | Easy | Two Sum' }],
      output_config: { format: { type: 'json_schema' } },
    });
    // Parameters newer models refuse, and anything that would let the model act: none are sent.
    for (const absent of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice', 'tools', 'stream']) {
      expect(sent.body).not.toHaveProperty(absent);
    }
    // The key travels in its header and nowhere else.
    expect(JSON.stringify(sent.body)).not.toContain(KEY);
    // The schema names the plan's shape.
    const schema = JSON.stringify((sent.body?.output_config as { format: { schema: unknown } }).format.schema);
    for (const field of ['topics', 'foundations', 'groups', 'challenge', 'description', 'problems']) {
      expect(schema).toContain(`"${field}"`);
    }
  });

  it('asks again the plain way when the API refuses the request as sent', async () => {
    const network = fakeNetwork([apiError(400, 'invalid_request_error'), message(JSON.stringify(plan))]);
    expect(await ask(network)).toEqual({ kind: 'json', value: plan, text: JSON.stringify(plan) });
    expect(network.seen).toHaveLength(2);
    const second = network.seen[1]!;
    expect(second.headers['anthropic-beta'] ?? '').not.toContain('server-side-fallback');
    expect(second.body).not.toHaveProperty('fallbacks');
    expect(second.body).toMatchObject({ model: 'claude-opus-5-5', output_config: { format: { type: 'json_schema' } } });
  });
});

describe('answers', () => {
  it('returns the JSON the model wrote', async () => {
    const network = fakeNetwork([message(JSON.stringify(plan))]);
    expect(await ask(network)).toEqual({ kind: 'json', value: plan, text: JSON.stringify(plan) });
  });

  it('reads past blocks that are not text', async () => {
    const network = fakeNetwork([
      message('', 'end_turn', {
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: JSON.stringify(plan) },
        ],
      }),
    ]);
    expect(await ask(network)).toMatchObject({ kind: 'json', value: plan });
  });

  it('says so when the model declines', async () => {
    const network = fakeNetwork([
      message('', 'refusal', { content: [], stop_details: { type: 'refusal', category: null, explanation: 'Declined.' } }),
    ]);
    expect(await ask(network)).toEqual({ kind: 'refused', explanation: 'Declined.' });
  });

  it('says so when the answer is cut off, instead of failing on the half-written JSON', async () => {
    const network = fakeNetwork([message('{"topics":[{"topic":"binary-sea', 'max_tokens')]);
    expect(await ask(network)).toEqual({ kind: 'truncated' });
  });

  it('hands back an answer that is not JSON, so the caller can ask again', async () => {
    const network = fakeNetwork([message('Here is your plan!')]);
    expect(await ask(network)).toEqual({ kind: 'unparseable', text: 'Here is your plan!' });
  });
});

describe('failures', () => {
  const cases: [string, Reply[], LlmError['kind'], RegExp][] = [
    ['a key Anthropic does not accept', [apiError(401, 'authentication_error')], 'bad_key', /did not accept the API key/],
    ['a key without access to the model', [apiError(403, 'permission_error')], 'no_access', /not allowed to use that model/],
    ['a model Anthropic does not know', [apiError(404, 'not_found_error')], 'bad_model', /does not know that model/],
    ['too many requests', [apiError(429, 'rate_limit_error')], 'rate_limited', /Wait a minute/],
    ['trouble at Anthropic', [apiError(529, 'overloaded_error')], 'unavailable', /having trouble right now/],
    ['no connection', [new TypeError('fetch failed')], 'offline', /Could not reach Anthropic/],
    [
      'a request refused twice',
      [apiError(400, 'invalid_request_error'), apiError(400, 'invalid_request_error')],
      'other',
      /refused the request \(400\)/,
    ],
  ];
  for (const [name, replies, kind, text] of cases) {
    it(`turns ${name} into a message the user can act on, without the key`, async () => {
      const expected = replies.length;
      const network = fakeNetwork([...replies]);
      const error = await ask(network).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).kind).toBe(kind);
      expect((error as LlmError).message).toMatch(text);
      expect((error as LlmError).message).not.toContain(KEY);
      expect(network.seen).toHaveLength(expected);
    });
  }
});

describe('listing models', () => {
  it('returns the model IDs the key may use', async () => {
    const network = fakeNetwork([
      {
        status: 200,
        body: {
          data: [
            { id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' },
            { id: 'claude-sonnet-5-5', type: 'model', display_name: 'Claude Sonnet 5.5', created_at: '2026-01-01T00:00:00Z' },
          ],
          has_more: false,
          first_id: 'claude-opus-5-5',
          last_id: 'claude-sonnet-5-5',
        },
      },
    ]);
    expect(await listModels(KEY, { fetch: network.fetch, maxRetries: 0 })).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    expect(network.seen[0]).toMatchObject({ method: 'GET' });
    expect(new URL(network.seen[0]!.url).pathname).toBe('/v1/models');
    expect(keyHeader(network.seen[0]!)).toContain(KEY);
  });

  it('says so when the key is not accepted', async () => {
    const network = fakeNetwork([apiError(401, 'authentication_error')]);
    await expect(listModels(KEY, { fetch: network.fetch, maxRetries: 0 })).rejects.toMatchObject({ kind: 'bad_key' });
  });
});
