// One bridge call from raw input to reply: valid input reaches the use case, invalid input does
// not, and a failure comes back as a message the UI can show as it is.
import { afterEach, describe, expect, it } from 'vitest';
import { unwrapReply } from '../../bridge/channels';
import { dispatch } from './dispatch';
import { createTestApp, type TestApp } from './testing';

let app: TestApp | undefined;
afterEach(() => {
  app?.close();
  app = undefined;
});

describe('dispatch', () => {
  it('answers with the value', async () => {
    const made = (app = createTestApp());
    const reply = await dispatch(made.handlers, 'getSettings', undefined);
    expect(reply).toMatchObject({ ok: true, value: { firstReminderTime: '16:00' } });
    expect(unwrapReply(reply)).toMatchObject({ firstReminderTime: '16:00' });
  });

  it('refuses invalid input before it reaches a use case', async () => {
    const made = (app = createTestApp());
    const failures: string[] = [];
    const reply = await dispatch(made.handlers, 'openProblem', { problemId: 'https://example.com' }, (method) => failures.push(method));
    expect(reply.ok).toBe(false);
    expect(reply).toMatchObject({ message: expect.stringMatching(/^Invalid input for openProblem: /) });
    expect(made.openedUrls).toEqual([]);
    // Nothing failed inside the app: there is nothing to log.
    expect(failures).toEqual([]);
  });

  it('turns a failure into its message, whether the use case throws at once or later', async () => {
    const made = (app = createTestApp());
    const failures: [string, unknown][] = [];
    const note = (method: string, error: unknown): void => void failures.push([method, error]);
    // A synchronous use case that throws.
    const gone = await dispatch(made.handlers, 'getPlan', { planId: 999 }, note);
    expect(gone).toEqual({ ok: false, message: 'That plan no longer exists.' });
    // An asynchronous one that rejects.
    const noKey = await dispatch(
      made.handlers,
      'generatePlan',
      { topics: ['binary-search'], platforms: ['leetcode'], level: 'some', targetSize: 12 },
      note,
    );
    expect(noKey).toEqual({ ok: false, message: 'Add an Anthropic API key in Settings to generate a plan.' });
    expect(failures.map(([method]) => method)).toEqual(['getPlan', 'generatePlan']);
    expect(failures[0]?.[1]).toBeInstanceOf(Error);
  });

  it('never passes the input to the failure log', async () => {
    const made = (app = createTestApp());
    made.secrets.available = false;
    const logged: unknown[] = [];
    const reply = await dispatch(made.handlers, 'saveApiKey', { apiKey: 'sk-ant-test-key-111111' }, (...parts) => logged.push(parts));
    expect(reply.ok).toBe(false);
    expect(JSON.stringify(reply)).not.toContain('sk-ant');
    expect(JSON.stringify(logged, (_key, value: unknown) => (value instanceof Error ? value.message : value))).not.toContain('sk-ant');
  });
});

describe('unwrapReply', () => {
  it('hands back the value', () => {
    expect(unwrapReply({ ok: true, value: 7 })).toBe(7);
    expect(unwrapReply({ ok: true, value: null })).toBeNull();
  });

  it('throws the message exactly as main wrote it', () => {
    expect(() => unwrapReply({ ok: false, message: 'That plan no longer exists.' })).toThrow(
      new Error('That plan no longer exists.'),
    );
  });

  it('throws a plain message when the reply has the wrong shape', () => {
    for (const odd of [undefined, null, 7, 'text', {}]) {
      expect(() => unwrapReply(odd)).toThrow('ParaLeet did not answer. Try again.');
    }
  });
});
