// Builds seed/catalog-<platform>.json from live sources. Run with:
//   npm run seed:catalog               all three
//   npm run seed:leetcode | seed:cses | seed:codeforces
//
// Build-time only. Metadata and links are fetched and stored, never problem statements.
// If a source cannot be reached or a check fails, the existing file is left untouched.
import {
  CODEFORCES_MIN_SOLVED,
  CODEFORCES_WINDOW,
  transformCodeforces,
  transformCses,
  transformLeetcode,
  type CatalogTransform,
} from '../../src/platforms/catalog';
import { CATALOG_PLATFORMS, type CatalogPlatform } from '../../src/data/seedFormat';
import { fetchCodeforces, fetchCses, fetchLeetcode } from './catalog-fetch';
import { buildSeed, catalogPath, formatReport, summarize, writeCatalog, type CatalogSummary } from './catalog-files';

interface Job {
  source: string;
  /** Fetches and transforms; throws a plain message when the result is not credible. */
  run: () => Promise<{ transform: CatalogTransform; note?: string }>;
}

function requireAtLeast(label: string, count: number, minimum: number): void {
  if (count < minimum) throw new Error(`Only ${count} ${label} came back (expected at least ${minimum}): not writing a partial catalog.`);
}

const JOBS: Record<CatalogPlatform, Job> = {
  leetcode: {
    source: 'LeetCode GraphQL question list (metadata only), fetched by scripts/seed/build-catalog.ts',
    async run() {
      const transform = transformLeetcode(await fetchLeetcode());
      requireAtLeast('free LeetCode problems', transform.entries.length, 1000);
      return { transform };
    },
  },
  cses: {
    source: 'https://cses.fi/problemset/ task list, fetched by scripts/seed/build-catalog.ts',
    async run() {
      const transform = transformCses(await fetchCses());
      requireAtLeast('CSES tasks', transform.entries.length, 200);
      return { transform };
    },
  },
  codeforces: {
    source: 'https://codeforces.com/api/problemset.problems, fetched by scripts/seed/build-catalog.ts',
    async run() {
      const transform = transformCodeforces(await fetchCodeforces());
      const kept = transform.entries.length;
      if (kept < CODEFORCES_WINDOW.min || kept > CODEFORCES_WINDOW.max) {
        throw new Error(
          `${kept} Codeforces problems have at least ${CODEFORCES_MIN_SOLVED} solves; the target is ${CODEFORCES_WINDOW.min} to ${CODEFORCES_WINDOW.max}. Adjust CODEFORCES_MIN_SOLVED in src/platforms/catalog/codeforces.ts.`,
        );
      }
      return { transform, note: `solved-count floor: ${CODEFORCES_MIN_SOLVED} (window ${CODEFORCES_WINDOW.min}-${CODEFORCES_WINDOW.max}), kept ${kept}` };
    },
  },
};

async function build(platform: CatalogPlatform): Promise<CatalogSummary & { platform: CatalogPlatform; status: string }> {
  const job = JOBS[platform];
  const { transform, note } = await job.run();
  const seed = buildSeed(platform, job.source, transform, new Date().toISOString());
  const summary = summarize(seed, transform);
  console.log(formatReport(platform, summary, note));
  const status = writeCatalog(seed);
  console.log(status === 'written' ? `wrote ${catalogPath(platform)}` : 'nothing changed except the timestamp: file left as it was');
  console.log('');
  return { ...summary, platform, status };
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2).filter((arg) => arg !== 'all');
  const platforms = wanted.length === 0 ? [...CATALOG_PLATFORMS] : wanted;
  for (const platform of platforms) {
    if (!(CATALOG_PLATFORMS as readonly string[]).includes(platform)) throw new Error(`Unknown platform "${platform}". Use leetcode, cses, codeforces or all.`);
  }

  const done: Awaited<ReturnType<typeof build>>[] = [];
  const failures: string[] = [];
  // Each platform is independent: one failing leaves its own file untouched and the others still update.
  for (const platform of platforms as CatalogPlatform[]) {
    try {
      done.push(await build(platform));
    } catch (error) {
      failures.push(`${platform}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (done.length > 1) {
    console.log('platform     fetched  kept  unmapped tags  empty topics');
    for (const row of done) {
      console.log(`${row.platform.padEnd(12)} ${String(row.fetched).padStart(7)} ${String(row.kept).padStart(5)} ${String(row.unmappedTags.length).padStart(14)}  ${row.emptyTopics.length}`);
    }
  }
  if (failures.length > 0) {
    console.error(`\nFailed:\n${failures.join('\n')}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
