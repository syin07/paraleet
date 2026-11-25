// Turns the HTML of https://cses.fi/problemset/ into catalog entries. Pure.
// Only the task list is read: section name, task link, title and the accepted count in the listing.
import { csesAdapter } from '../cses';
import { cleanTitle, type CatalogEntry, type CatalogTransform, type SkippedProblem } from './types';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec?: string, hex?: string, name?: string) => {
    if (dec !== undefined) return String.fromCodePoint(Number(dec));
    if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[(name ?? '').toLowerCase()] ?? whole;
  });
}

/** Tasks in listing order: sections top to bottom, and each section's tasks in CSES's own order. */
export function transformCses(listing: unknown): CatalogTransform {
  if (typeof listing !== 'string') throw new Error('CSES did not send a page');
  const html = listing;
  const skipped: SkippedProblem[] = [];
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  let fetched = 0;

  // <h2>Section</h2><ul class="task-list"><li class="task"><a href="/problemset/task/1068">Title</a>
  // <span class="detail">184925 / 193033</span> ...  (accepted / submitted)
  for (const chunk of html.split('<h2>').slice(1)) {
    const end = chunk.indexOf('</h2>');
    if (end < 0) continue;
    const section = cleanTitle(decodeEntities(chunk.slice(0, end)));
    const taskPattern =
      /<li class="task"><a href="([^"]*)">(.*?)<\/a>(?:<span class="detail">\s*(\d+)\s*\/\s*\d+\s*<\/span>)?/g;
    for (const match of chunk.slice(end).matchAll(taskPattern)) {
      fetched += 1;
      const [, href = '', rawTitle = '', accepted] = match;
      const platformId = /^\/problemset\/task\/\d+$/.test(href)
        ? csesAdapter.parseUrl(new URL(href, 'https://cses.fi'))
        : null;
      if (platformId === null || !csesAdapter.isValidId(platformId)) skipped.push({ what: href, reason: 'malformed ID' });
      else if (seen.has(platformId)) skipped.push({ what: platformId, reason: 'duplicate' });
      else {
        seen.add(platformId);
        entries.push({
          platform: 'cses',
          platformId,
          displayId: null,
          title: cleanTitle(decodeEntities(rawTitle)),
          url: csesAdapter.buildUrl(platformId),
          difficultyRaw: null,
          difficultyNorm: null,
          topics: csesAdapter.mapTags([section]),
          sourceTags: [section],
          solvedCount: accepted === undefined ? null : Number(accepted),
        });
      }
    }
  }
  return { fetched, entries, skipped };
}
