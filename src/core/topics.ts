// The app's fixed topic list (PRD section 7). Platform tags are mapped onto these IDs by the
// platform adapters. Owned by the lead: adding or renaming a topic affects seeds, plans and stats.

export const TOPICS = [
  { id: 'arrays-hashing', label: 'Arrays & hashing' },
  { id: 'two-pointers', label: 'Two pointers' },
  { id: 'sliding-window', label: 'Sliding window' },
  { id: 'prefix-sums', label: 'Prefix sums' },
  { id: 'binary-search', label: 'Binary search' },
  { id: 'sorting', label: 'Sorting' },
  { id: 'stacks', label: 'Stacks' },
  { id: 'heaps', label: 'Heaps' },
  { id: 'linked-lists', label: 'Linked lists' },
  { id: 'intervals', label: 'Intervals' },
  { id: 'trees', label: 'Trees' },
  { id: 'tries', label: 'Tries' },
  { id: 'graphs', label: 'Graphs (BFS/DFS)' },
  { id: 'shortest-paths', label: 'Shortest paths' },
  { id: 'union-find', label: 'Union-find' },
  { id: 'topological-sort', label: 'Topological sort' },
  { id: 'dynamic-programming', label: 'Dynamic programming' },
  { id: 'greedy', label: 'Greedy' },
  { id: 'backtracking', label: 'Backtracking' },
  { id: 'bit-manipulation', label: 'Bit manipulation' },
  { id: 'math', label: 'Math' },
  { id: 'strings', label: 'Strings' },
  { id: 'range-queries', label: 'Range queries' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'implementation', label: 'Implementation' },
] as const;

export type TopicId = (typeof TOPICS)[number]['id'];

export const TOPIC_IDS: readonly TopicId[] = TOPICS.map((topic) => topic.id);

const LABELS = new Map<string, string>(TOPICS.map((topic) => [topic.id, topic.label]));

export function isTopicId(value: string): value is TopicId {
  return LABELS.has(value);
}

export function topicLabel(id: TopicId): string {
  return LABELS.get(id) ?? id;
}
