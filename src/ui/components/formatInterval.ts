/** A review interval in whole days as a short phrase: "tomorrow", "in 5 days", "in about 6 months". */
export function formatInterval(value: number): string {
  // Anything that is not a number of at least 1 reads as the shortest interval.
  const days = Number.isFinite(value) && value >= 1 ? Math.round(value) : 1;
  if (days <= 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 56) return `in about ${Math.round(days / 7)} weeks`;
  if (days < 365) return `in about ${Math.max(2, Math.round(days / 30.4))} months`;
  if (days <= 547) return 'in about a year';
  return `in about ${Math.max(2, Math.round(days / 365))} years`;
}
