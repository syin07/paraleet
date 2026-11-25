// The app's log file: `paraleet.log` in the data folder, next to the database. A packaged app
// has no console anyone sees, so what would have gone there is kept here for the user to send.
// It holds failures and a line per launch. It never holds a bridge call's input or the API key.
import { appendFileSync, renameSync, statSync } from 'node:fs';

export const LOG_FILE_NAME = 'paraleet.log';
/** The log before the last rotation. One is kept. */
export const OLD_LOG_FILE_NAME = 'paraleet.log.old';
/** About this many bytes, then the file is set aside and a new one begun. */
export const LOG_MAX_BYTES = 1_000_000;

export interface AppLog {
  info(message: string): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

/** An error as text: its name, message and stack, without anything else that hangs off it. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * A log that appends to `path`. Writing the log must never break the app, so every failure to
 * write is swallowed. `echo` also gets each line, for the console in development.
 */
export function createLog(
  path: string,
  now: () => Date,
  options: { maxBytes?: number; echo?: (level: 'info' | 'warn' | 'error', line: string) => void } = {},
): AppLog {
  const maxBytes = options.maxBytes ?? LOG_MAX_BYTES;
  const oldPath = path.endsWith(LOG_FILE_NAME) ? `${path.slice(0, -LOG_FILE_NAME.length)}${OLD_LOG_FILE_NAME}` : `${path}.old`;

  function write(level: 'info' | 'warn' | 'error', message: string, error?: unknown): void {
    const text = error === undefined ? message : `${message} ${describeError(error)}`;
    const line = `${now().toISOString()} ${level.toUpperCase()} ${text}`;
    options.echo?.(level, line);
    try {
      let size = 0;
      try {
        size = statSync(path).size;
      } catch {
        // No log yet.
      }
      if (size >= maxBytes) renameSync(path, oldPath);
      appendFileSync(path, `${line}\n`);
    } catch {
      // A full disk or a folder that went away: the app carries on without a log.
    }
  }

  return {
    info: (message) => write('info', message),
    warn: (message, error) => write('warn', message, error),
    error: (message, error) => write('error', message, error),
  };
}
