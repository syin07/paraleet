/**
 * The URL's hostname without a single trailing dot. `URL` keeps "leetcode.com." as written, but it
 * is the same site, so every host check and the "Other" cleaning go through this one helper.
 */
export function hostnameOf(url: URL): string {
  return url.hostname.endsWith('.') ? url.hostname.slice(0, -1) : url.hostname;
}

/** Strips leading zeros from a run of digits; null when the number is zero (no such problem). */
export function plainNumber(digits: string): string | null {
  const plain = digits.replace(/^0+/, '');
  return plain === '' ? null : plain;
}

/** Looks `raw` up in a difficulty table by its trimmed, lower-cased text. Only the table's own keys count, never `constructor` or `__proto__`. */
export function lookupDifficulty<T>(table: Readonly<Record<string, T>>, raw: string | null): T | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return Object.hasOwn(table, key) ? (table[key] ?? null) : null;
}
