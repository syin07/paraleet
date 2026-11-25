// User settings and their defaults (PRD section 10). Stored as key-value rows; a missing or
// invalid value falls back to its default, so adding a setting never needs a migration.
import { z } from 'zod';
import { DEFAULT_BOUNDARY_HOUR } from './day';
import { DEFAULT_PLAN_MODEL } from './plan';
import { DEFAULT_TARGET_RETENTION } from './scheduler';

/** A local wall-clock time, `HH:MM` in 24-hour form. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 16:00');

// No zod defaults here on purpose: the patch schema below must never fill in missing keys.
export const settingsSchema = z.object({
  /** Hour of the day (0 to 23) at which a new ParaLeet day starts. */
  dayBoundaryHour: z.number().int().min(0).max(23),
  firstReminderTime: timeOfDaySchema,
  eveningReminderTime: timeOfDaySchema,
  /** Probability of recall the review schedule aims for. */
  targetRetention: z.number().min(0.7).max(0.97),
  petVisible: z.boolean(),
  petWindowPosition: z.object({ x: z.number(), y: z.number() }).nullable(),
  launchAtLogin: z.boolean(),
  /** Unused in v1; kept for later solve verification (PRD section 8). */
  leetcodeHandle: z.string().max(64),
  /** The Anthropic model that writes learning plans (PRD section 7). */
  planModel: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:@-]+$/, 'Use a model ID such as claude-opus-5-5'),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  dayBoundaryHour: DEFAULT_BOUNDARY_HOUR,
  firstReminderTime: '16:00',
  eveningReminderTime: '21:00',
  targetRetention: DEFAULT_TARGET_RETENTION,
  petVisible: true,
  petWindowPosition: null,
  launchAtLogin: true,
  leetcodeHandle: '',
  planModel: DEFAULT_PLAN_MODEL,
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

/** A partial update: only the given keys change. */
export const settingsPatchSchema = settingsSchema.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Builds full settings from stored values, using the default for any key that is missing or invalid. */
export function resolveSettings(stored: Readonly<Record<string, unknown>>): Settings {
  const resolved: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    if (!(key in stored)) continue;
    const parsed = settingsSchema.shape[key].safeParse(stored[key]);
    if (parsed.success) resolved[key] = parsed.data;
  }
  return resolved as Settings;
}
