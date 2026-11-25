import { resolveSettings, type Settings, type SettingsPatch } from '../../core/settings';
import type { Db } from '../db';

function readStored(db: Db): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  for (const row of db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      // An unreadable value falls back to its default.
    }
  }
  return stored;
}

export function getSettings(db: Db): Settings {
  return resolveSettings(readStored(db));
}

/** Saves only the keys present in `patch` and returns the full settings. */
export function updateSettings(db: Db, patch: SettingsPatch): Settings {
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      );
    }
  });
  return getSettings(db);
}

/** Internal app state kept beside settings (for example the loaded seed version). */
export function getMeta(db: Db, key: string): string | null {
  return db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [`meta.${key}`])?.value ?? null;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
    `meta.${key}`,
    value,
  ]);
}
