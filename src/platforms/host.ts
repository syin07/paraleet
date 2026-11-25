/**
 * The URL's hostname without any trailing dots. `URL` keeps "leetcode.com." (and even
 * "leetcode.com..") as written, but it is the same site, so every host check and the "Other"
 * cleaning go through this one helper.
 */
export function hostnameOf(url: URL): string {
  let end = url.hostname.length;
  while (end > 0 && url.hostname[end - 1] === '.') end--;
  return url.hostname.slice(0, end);
}

/** True when the host has no empty label (`a..b.com`, `.example.com`) and is not empty: such a link can never open. */
export function hasWellFormedHost(url: URL): boolean {
  const host = hostnameOf(url);
  return host !== '' && host.split('.').every((label) => label !== '');
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
