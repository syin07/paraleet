import type { TopicId } from '../core/topics';

/** Looks each source tag up in `table` (keys lower case), ignoring case and surrounding spaces. Unknown tags are skipped, duplicates collapse. */
export function mapTagsWith(
  table: Readonly<Record<string, TopicId | readonly TopicId[]>>,
  sourceTags: readonly string[]
): TopicId[] {
  const topics = new Set<TopicId>();
  for (const tag of sourceTags) {
    const key = tag.trim().toLowerCase();
    // hasOwn so that a tag such as "constructor" never reaches the prototype.
    const mapped = Object.hasOwn(table, key) ? table[key] : undefined;
    if (mapped === undefined) continue;
    for (const topic of typeof mapped === 'string' ? [mapped] : mapped) topics.add(topic);
  }
  return [...topics];
}
