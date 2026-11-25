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

/** "About 60 problems from 3 topics". */
export function summaryLine(topicCount: number, sizePerTopic: number): string {
  if (topicCount === 0) return 'Pick at least one topic';
  return `About ${topicCount * sizePerTopic} problems from ${topicCount} ${topicCount === 1 ? 'topic' : 'topics'}`;
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
