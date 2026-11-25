import { m001Initial } from './001_initial';
import { m002PetStateAndCatalog } from './002_pet_state_and_catalog';
import { m003Plans } from './003_plans';
import type { Migration } from './types';

export type { Migration } from './types';

/** Every migration, oldest first. To change the schema, append a new numbered file; never edit an old one. */
export const MIGRATIONS: readonly Migration[] = [m001Initial, m002PetStateAndCatalog, m003Plans];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;
