import { m001Initial } from './001_initial';
import type { Migration } from './types';

export type { Migration } from './types';

/** Every migration, oldest first. To change the schema, append a new numbered file; never edit an old one. */
export const MIGRATIONS: readonly Migration[] = [m001Initial];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;
