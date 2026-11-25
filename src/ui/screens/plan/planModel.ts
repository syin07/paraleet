// Pure helpers for the Plan screen: counts, labels and grouping. No React here.
import type { PlanSectionView } from '../../../bridge/contract';
import { PLAN_MAX_TOPICS, type PlanPlatform, type PlanProgress, type PlanStatus } from '../../../core/plan';
import type { TopicId } from '../../../core/topics';

/** How many catalog problems a topic has on the chosen platforms. */
export function topicProblemCount(counts: Record<PlanPlatform, number>, platforms: readonly PlanPlatform[]): number {
  return platforms.reduce((sum, platform) => sum + counts[platform], 0);
}

/** Adds or removes a topic. A fifth topic is refused: the list comes back unchanged. */
export function toggleTopic(selected: readonly TopicId[], topic: TopicId, max: number = PLAN_MAX_TOPICS): TopicId[] {
  if (selected.includes(topic)) return selected.filter((id) => id !== topic);
  return selected.length >= max ? [...selected] : [...selected, topic];
}

/**
 * "About 60 problems from 3 topics". `available` is how many catalog problems each chosen topic
 * has on the chosen platforms: a thin topic cannot give the full size.
 */
export function summaryLine(available: readonly number[], sizePerTopic: number): string {
  const topics = available.length;
  if (topics === 0) return 'Pick at least one topic';
  const total = available.reduce((sum, count) => sum + Math.min(sizePerTopic, count), 0);
  return `About ${total} problems from ${topics} ${topics === 1 ? 'topic' : 'topics'}`;
}

/** "5 / 22", with " · 1 skipped" when some problems were skipped, so the numbers visibly add up. */
export function progressFigure(progress: PlanProgress): string {
  const base = `${finishedCount(progress)} / ${progress.total}`;
  return progress.skipped > 0 ? `${base} · ${progress.skipped} skipped` : base;
}

/** True when nothing is pending in a plan that has problems. */
export function allFinished(progress: PlanProgress): boolean {
  return progress.total > 0 && progress.pending === 0;
}

/** "Greedy has no problems on the platforms left, so it was unpicked." */
export function droppedNote(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `${list} ${labels.length === 1 ? 'has' : 'have'} no problems on the platforms left, so ${labels.length === 1 ? 'it was' : 'they were'} unpicked.`;
}

/** Problems that need no more work: done, or skipped because they were solved before. */
export function finishedCount(progress: PlanProgress): number {
  return progress.done + progress.skipped;
}

/** 0 to 100, for a progress bar. An empty plan is 0. */
export function percentDone(progress: PlanProgress): number {
  return progress.total === 0 ? 0 : Math.round((finishedCount(progress) / progress.total) * 100);
}

/** A card with work left stays open; one with nothing pending collapses to its header. */
export function startsCollapsed(progress: PlanProgress): boolean {
  return progress.total > 0 && progress.pending === 0;
}

export interface TopicBlock {
  topic: TopicId;
  /** The sections of this topic with their position in the plan's own section list. */
  sections: { section: PlanSectionView; index: number }[];
}

/** One block per topic, in plan order. A topic's sections are kept together. */
export function groupByTopic(sections: readonly PlanSectionView[]): TopicBlock[] {
  const blocks: TopicBlock[] = [];
  sections.forEach((section, index) => {
    const block = blocks.find((candidate) => candidate.topic === section.topic);
    if (block) block.sections.push({ section, index });
    else blocks.push({ topic: section.topic, sections: [{ section, index }] });
  });
  return blocks;
}

export const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  done: 'Finished',
  archived: 'Archived',
};

/** "Nov 25": when a plan was made. */
export function formatCreated(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
