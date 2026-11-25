// The log file: lines are appended with a time and a level, the file is set aside when it grows
// large, and a log that cannot be written never breaks the app.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLog, describeError, LOG_FILE_NAME, OLD_LOG_FILE_NAME } from './log';

let dir: string;
const at = (iso: string) => () => new Date(iso);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'paraleet-log-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the log file', () => {
  it('appends one line per entry, with the time and the level', () => {
    const path = join(dir, LOG_FILE_NAME);
    const log = createLog(path, at('2026-11-25T20:00:00.000Z'));
    log.info('ParaLeet 0.1.0 started');
    log.warn('The catalog could not be loaded');
    log.error('submitReport failed:', new Error('disk is full'));
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
    expect(lines[0]).toBe('2026-11-25T20:00:00.000Z INFO ParaLeet 0.1.0 started');
    expect(lines[1]).toBe('2026-11-25T20:00:00.000Z WARN The catalog could not be loaded');
    expect(lines[2]).toBe('2026-11-25T20:00:00.000Z ERROR submitReport failed: Error: disk is full');
    // The stack follows the error's own line.
    expect(lines.slice(3).every((line) => line.startsWith('    at '))).toBe(true);
  });

  it('keeps what an earlier run wrote', () => {
    const path = join(dir, LOG_FILE_NAME);
    createLog(path, at('2026-11-25T20:00:00.000Z')).info('first run');
    createLog(path, at('2026-11-26T20:00:00.000Z')).info('second run');
    expect(readFileSync(path, 'utf8')).toBe('2026-11-25T20:00:00.000Z INFO first run\n2026-11-26T20:00:00.000Z INFO second run\n');
  });

  it('sets a large file aside and begins a new one, keeping one old file', () => {
    const path = join(dir, LOG_FILE_NAME);
    const old = join(dir, OLD_LOG_FILE_NAME);
    const log = createLog(path, at('2026-11-25T20:00:00.000Z'), { maxBytes: 200 });
    for (let index = 0; index < 4; index += 1) log.info(`entry ${index} ${'x'.repeat(60)}`);
    // Three entries reach the limit; the fourth starts a new file.
    expect(readFileSync(old, 'utf8').trimEnd().split('\n')).toHaveLength(3);
    expect(readFileSync(path, 'utf8')).toContain('entry 3');
    for (let index = 4; index < 8; index += 1) log.info(`entry ${index} ${'x'.repeat(60)}`);
    // The older old file is replaced, not kept beside a third one.
    expect(readFileSync(old, 'utf8')).toContain('entry 3');
    expect(readFileSync(old, 'utf8')).not.toContain('entry 0');
    expect(readFileSync(path, 'utf8')).toContain('entry 7');
  });

  it('never throws when the log cannot be written', () => {
    const log = createLog(join(dir, 'no-such-folder', LOG_FILE_NAME), at('2026-11-25T20:00:00.000Z'));
    expect(() => log.error('still fine', new Error('x'))).not.toThrow();
    // A folder where the file should be.
    const blocked = join(dir, 'blocked');
    writeFileSync(blocked, '');
    const inside = createLog(join(blocked, LOG_FILE_NAME), at('2026-11-25T20:00:00.000Z'));
    expect(() => inside.info('still fine')).not.toThrow();
    expect(existsSync(join(dir, 'no-such-folder'))).toBe(false);
  });

  it('never throws on a thrown value that fails when it is read, or on an echo that fails', () => {
    const path = join(dir, LOG_FILE_NAME);
    const hostile = {
      get message(): string {
        throw new Error('no reading me');
      },
    };
    const log = createLog(path, at('2026-11-25T20:00:00.000Z'), {
      echo: () => {
        throw new Error('no console');
      },
    });
    expect(() => log.error('Could not do it:', hostile)).not.toThrow();
    // The entry is still written, without the part that could not be read.
    expect(readFileSync(path, 'utf8')).toBe('ERROR Could not do it: (the error could not be read)\n');
  });

  it('keeps writing when a full log cannot be set aside', () => {
    const path = join(dir, LOG_FILE_NAME);
    // A folder where the old log should go makes the rename fail.
    mkdirSync(join(dir, OLD_LOG_FILE_NAME));
    writeFileSync(join(dir, OLD_LOG_FILE_NAME, 'in-the-way'), '');
    const log = createLog(path, at('2026-11-25T20:00:00.000Z'), { maxBytes: 10 });
    log.info('the first line is longer than ten bytes');
    log.info('second');
    expect(readFileSync(path, 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('echoes each line, for the console in development', () => {
    const seen: string[] = [];
    const log = createLog(join(dir, LOG_FILE_NAME), at('2026-11-25T20:00:00.000Z'), {
      echo: (level, line) => seen.push(`${level}|${line}`),
    });
    log.warn('careful');
    expect(seen).toEqual(['warn|2026-11-25T20:00:00.000Z WARN careful']);
  });
});

describe('describeError', () => {
  it('gives an error as its stack, and anything else as plain text', () => {
    expect(describeError(new Error('boom'))).toMatch(/^Error: boom\n\s+at /);
    expect(describeError('plain')).toBe('plain');
    expect(describeError(7)).toBe('7');
    expect(describeError(undefined)).toBe('A thrown undefined.');
    expect(describeError(null)).toBe('A thrown object.');
  });

  it('never writes a thrown object whole: only its message, if it has one', () => {
    const rejected = { message: 'Request failed', headers: { authorization: 'Bearer sk-ant-secret-key-123456' }, notes: 'typed by the user' };
    expect(describeError(rejected)).toBe('A thrown object that is not an error: Request failed');
    expect(describeError({ code: 7, key: 'sk-ant-secret-key-123456' })).toBe('A thrown object that is not an error.');
  });

  it('does not carry properties that hang off an error, such as a request with its headers', () => {
    const error = Object.assign(new Error('Request failed'), { headers: { authorization: 'Bearer sk-ant-secret-key-123456' } });
    expect(describeError(error)).not.toContain('sk-ant-secret-key-123456');
  });
});
