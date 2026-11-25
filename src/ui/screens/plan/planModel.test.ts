import { describe, expect, it } from 'vitest';
import type { PlanSectionView } from '../../../bridge/contract';
import { groupByTopic, percentDone, startsCollapsed, summaryLine, toggleTopic, topicProblemCount } from './planModel';

const progress = (done: number, skipped: number, pending: number) => ({ done, skipped, pending, total: done + skipped + pending });

describe('topicProblemCount', () => {
  const counts = { leetcode: 10, cses: 0, codeforces: 5 };
  it('adds only the chosen platforms', () => {
    expect(topicProblemCount(counts, ['leetcode'])).toBe(10);
    expect(topicProblemCount(counts, ['leetcode', 'codeforces'])).toBe(15);
    expect(topicProblemCount(counts, ['cses'])).toBe(0);
  });
});

describe('toggleTopic', () => {
  it('adds, removes and refuses a fifth', () => {
    expect(toggleTopic([], 'math')).toEqual(['math']);
    expect(toggleTopic(['math', 'greedy'], 'math')).toEqual(['greedy']);
    const four = ['math', 'greedy', 'trees', 'heaps'] as const;
    expect(toggleTopic(four, 'stacks')).toEqual([...four]);
    expect(toggleTopic(four, 'heaps')).toEqual(['math', 'greedy', 'trees']);
  });
});

describe('summaryLine', () => {
  it('multiplies topics by size', () => {
    expect(summaryLine(3, 20)).toBe('About 60 problems from 3 topics');
    expect(summaryLine(1, 10)).toBe('About 10 problems from 1 topic');
    expect(summaryLine(0, 20)).toBe('Pick at least one topic');
  });
});

describe('progress helpers', () => {
  it('counts skipped as finished', () => {
    expect(percentDone(progress(2, 1, 1))).toBe(75);
    expect(percentDone(progress(0, 0, 0))).toBe(0);
  });
  it('collapses only a card with work done and nothing pending', () => {
    expect(startsCollapsed(progress(3, 0, 0))).toBe(true);
    expect(startsCollapsed(progress(2, 1, 0))).toBe(true);
    expect(startsCollapsed(progress(2, 0, 1))).toBe(false);
    expect(startsCollapsed(progress(0, 0, 0))).toBe(false);
  });
});

describe('groupByTopic', () => {
  const section = (topic: PlanSectionView['topic']): PlanSectionView => ({
    topic,
    stage: 'foundations',
    groupName: null,
    groupDescription: null,
    progress: progress(0, 0, 1),
    items: [],
  });
  it('keeps plan order and remembers each section index', () => {
    const blocks = groupByTopic([section('math'), section('math'), section('greedy')]);
    expect(blocks.map((block) => block.topic)).toEqual(['math', 'greedy']);
    expect(blocks[0]?.sections.map((entry) => entry.index)).toEqual([0, 1]);
    expect(blocks[1]?.sections.map((entry) => entry.index)).toEqual([2]);
  });
});
