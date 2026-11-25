// File and report helpers shared by the catalog scripts. No network here; see catalog-fetch.ts.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOPICS } from '../../src/core/topics';
import { adapterFor } from '../../src/platforms';
import type { CatalogTransform } from '../../src/platforms/catalog';
import {
  catalogSeedSchema,
  validateSeedProblems,
  type CatalogPlatform,
  type CatalogSeed,
} from '../../src/data/seedFormat';

export function catalogPath(platform: CatalogPlatform): string {
  return resolve(import.meta.dirname, `../../seed/catalog-${platform}.json`);
}

/** Header fields, then one compact problem per line, so a diff shows one line per changed problem. */
export function serializeCatalog(seed: CatalogSeed): string {
  const { problems, ...header } = seed;
  const lines = Object.entries(header).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  const rows = problems.map((problem, index) => `${JSON.stringify(problem)}${index < problems.length - 1 ? ',' : ''}`);
  return `{\n${lines.join('\n')}\n  "problems": [\n${rows.join('\n')}\n  ]\n}\n`;
}

function withoutTimestamp(text: string): string {
  return text.replace(/"generatedAt": "[^"]*"/, '"generatedAt": ""');
}

/**
 * Writes the catalog file unless nothing but `generatedAt` changed. The file is written next to
 * its final name and renamed into place, so a crash never leaves a partial file.
 */
export function writeCatalog(seed: CatalogSeed): 'written' | 'unchanged' {
  const file = catalogPath(seed.platform);
  const text = serializeCatalog(seed);
  if (existsSync(file) && withoutTimestamp(readFileSync(file, 'utf8')) === withoutTimestamp(text)) return 'unchanged';
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, file);
  return 'written';
}

/** Builds the seed from a transform's entries and validates it. Throws, listing every problem, if it is not good. */
export function buildSeed(
  platform: CatalogPlatform,
  source: string,
  transform: CatalogTransform,
  generatedAt: string,
): CatalogSeed {
  const seed = catalogSeedSchema.parse({ generatedAt, source, platform, problems: transform.entries });
  const errors = validateSeedProblems(seed.problems);
  if (errors.length > 0) throw new Error(`The ${platform} catalog failed validation:\n${errors.slice(0, 20).join('\n')}`);
  return seed;
}

function count<T>(items: Iterable<T>): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

export interface CatalogSummary {
  fetched: number;
  kept: number;
  skippedByReason: [string, number][];
  difficulty: [string, number][];
  perTopic: [string, number][];
  /** Platform tags that map to no topic, most common first. */
  unmappedTags: [string, number][];
  /** App topics with no problem at all. */
  emptyTopics: string[];
}

export function summarize(seed: CatalogSeed, transform: CatalogTransform): CatalogSummary {
  const adapter = adapterFor(seed.platform);
  const byCountDesc = (a: [string, number], b: [string, number]): number => b[1] - a[1] || a[0].localeCompare(b[0]);
  const tagCounts = count(seed.problems.flatMap((problem) => problem.sourceTags));
  const unmapped = [...tagCounts].filter(([tag]) => adapter?.mapTags([tag]).length === 0).sort(byCountDesc);
  const topicCounts = count(seed.problems.flatMap((problem) => problem.topics));
  return {
    fetched: transform.fetched,
    kept: seed.problems.length,
    skippedByReason: [...count(transform.skipped.map((skip) => skip.reason))].sort(byCountDesc),
    difficulty: [...count(seed.problems.map((problem) => problem.difficultyNorm ?? 'none'))]
      .map(([key, value]): [string, number] => [String(key), value])
      .sort((a, b) => a[0].localeCompare(b[0])),
    perTopic: TOPICS.map((topic): [string, number] => [topic.id, topicCounts.get(topic.id) ?? 0]),
    unmappedTags: unmapped,
    emptyTopics: TOPICS.filter((topic) => !topicCounts.has(topic.id)).map((topic) => topic.id),
  };
}

function pairs(items: [string, number][], empty = 'none'): string {
  return items.length === 0 ? empty : items.map(([key, value]) => `${key}=${value}`).join(', ');
}

export function formatReport(platform: string, summary: CatalogSummary, floorNote?: string): string {
  const lines = [
    `== ${platform} ==`,
    `fetched ${summary.fetched}, kept ${summary.kept}, skipped ${summary.fetched - summary.kept}`,
    ...(floorNote ? [floorNote] : []),
    `skipped by reason: ${pairs(summary.skippedByReason)}`,
    `difficulty (normalized 1-5): ${pairs(summary.difficulty)}`,
    `problems per app topic: ${pairs(summary.perTopic)}`,
    `topics with no problems: ${summary.emptyTopics.join(', ') || 'none'}`,
    `unmapped tags (${summary.unmappedTags.length}): ${pairs(summary.unmappedTags)}`,
  ];
  return lines.join('\n');
}
