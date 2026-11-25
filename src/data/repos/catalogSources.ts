import type { IsoInstant, Platform } from '../../core/types';
import type { Db } from '../db';

export interface CatalogSource {
  platform: Platform;
  source: string;
  generatedAt: IsoInstant;
  problemCount: number;
  loadedAt: IsoInstant;
}

interface Row {
  platform: Platform;
  source: string;
  generated_at: string;
  problem_count: number;
  loaded_at: string;
}

export function getCatalogSource(db: Db, platform: Platform): CatalogSource | null {
  const row = db.get<Row>(
    'SELECT platform, source, generated_at, problem_count, loaded_at FROM catalog_sources WHERE platform = ?',
    [platform],
  );
  return row
    ? {
        platform: row.platform,
        source: row.source,
        generatedAt: row.generated_at,
        problemCount: row.problem_count,
        loadedAt: row.loaded_at,
      }
    : null;
}

export function recordCatalogSource(db: Db, source: CatalogSource): void {
  db.run(
    `INSERT INTO catalog_sources (platform, source, generated_at, problem_count, loaded_at)
     VALUES (:platform, :source, :generatedAt, :problemCount, :loadedAt)
     ON CONFLICT (platform) DO UPDATE SET source = excluded.source, generated_at = excluded.generated_at,
       problem_count = excluded.problem_count, loaded_at = excluded.loaded_at`,
    { ...source },
  );
}
