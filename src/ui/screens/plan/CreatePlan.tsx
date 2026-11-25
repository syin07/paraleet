// The create form: topics, platforms, level and size on one page, then "Generate plan".
import { ArrowLeft, Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PlanOverview, PlanView } from '../../../bridge/contract';
import {
  PLAN_LEVELS,
  PLAN_LEVEL_LABELS,
  PLAN_MAX_TOPICS,
  PLAN_PLATFORMS,
  PLAN_SIZE_DEFAULT,
  type PlanLevel,
  type PlanPlatform,
} from '../../../core/plan';
import { topicLabel, type TopicId } from '../../../core/topics';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Page } from '../../components/Layout';
import { cx, PLATFORM_LABELS } from '../../lib/format';
import { InlineError } from './notices';
import { droppedNote, summaryLine, toggleTopic, topicProblemCount } from './planModel';

const SIZES = [10, 20, 30] as const;
const LEVEL_LINES: Record<PlanLevel, string> = {
  new: 'Start with the basics.',
  some: 'Know the ideas, want fluency.',
  comfortable: 'Mostly harder problems.',
};

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-md font-semibold text-fg">{title}</h2>
        {aside && <span className="text-sm text-fg-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const CHIP =
  'focus-ring app-no-drag inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-base transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40';
const chipTone = (on: boolean): string =>
  on ? 'border-accent-border bg-accent-subtle text-fg' : 'border-line bg-sunken text-fg-secondary hover:border-line-strong hover:text-fg';

export function CreatePlan({
  overview,
  onBack,
  onGenerated,
}: {
  overview: PlanOverview;
  onBack: () => void;
  onGenerated: (plan: PlanView) => void;
}) {
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [platforms, setPlatforms] = useState<PlanPlatform[]>([...PLAN_PLATFORMS]);
  const [level, setLevel] = useState<PlanLevel>('some');
  const [size, setSize] = useState<number>(PLAN_SIZE_DEFAULT);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Topics a platform change unpicked, named once so it is not a silent change.
  const [dropped, setDropped] = useState<string[]>([]);

  const countOf = (id: TopicId): number => {
    const topic = overview.topics.find((candidate) => candidate.id === id);
    return topic ? topicProblemCount(topic.counts, platforms) : 0;
  };

  function togglePlatform(platform: PlanPlatform): void {
    const next = platforms.includes(platform) ? platforms.filter((p) => p !== platform) : PLAN_PLATFORMS.filter((p) => p === platform || platforms.includes(p));
    if (next.length === 0) return;
    setPlatforms(next);
    // A chosen topic with nothing left on the new platforms drops out, and the form says so.
    const hasProblems = (id: TopicId): boolean => {
      const topic = overview.topics.find((candidate) => candidate.id === id);
      return topic ? topicProblemCount(topic.counts, next) > 0 : false;
    };
    setDropped(topics.filter((id) => !hasProblems(id)).map(topicLabel));
    setTopics(topics.filter(hasProblems));
  }

  async function generate(): Promise<void> {
    if (generating || topics.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      onGenerated(await api().generatePlan({ topics, platforms, level, targetSize: size }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setGenerating(false);
    }
  }

  return (
    <Page
      title="Create a plan"
      actions={
        <Button variant="ghost" icon={<ArrowLeft className="h-3.5 w-3.5" />} disabled={generating} onClick={onBack}>
          Back
        </Button>
      }
    >
      <div className="max-w-[640px]">
        <Section title="Topics" aside={`${topics.length} selected, up to ${PLAN_MAX_TOPICS}`}>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Topics">
            {overview.topics.map((topic) => {
              const selected = topics.includes(topic.id);
              const count = countOf(topic.id);
              const none = count === 0;
              const full = !selected && topics.length >= PLAN_MAX_TOPICS;
              return (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={generating || none || full}
                  title={none ? 'No problems on the chosen platforms' : full ? `Up to ${PLAN_MAX_TOPICS} topics` : undefined}
                  onClick={() => {
                    setDropped([]);
                    setTopics(toggleTopic(topics, topic.id));
                  }}
                  className={cx(CHIP, chipTone(selected))}
                >
                  {selected && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
                  <span>{topic.label}</span>
                  <span className="text-sm tabular-nums text-fg-muted">{count}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Platforms">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Platforms">
            {PLAN_PLATFORMS.map((platform) => {
              const on = platforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  aria-pressed={on}
                  disabled={generating || (on && platforms.length === 1)}
                  title={on && platforms.length === 1 ? 'Keep at least one platform' : undefined}
                  onClick={() => togglePlatform(platform)}
                  className={cx(CHIP, chipTone(on))}
                >
                  {on && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
                  {PLATFORM_LABELS[platform]}
                </button>
              );
            })}
          </div>
          {dropped.length > 0 && <p className="mt-2 text-sm text-fg-muted">{droppedNote(dropped)}</p>}
        </Section>

        <Section title="Level">
          <div role="radiogroup" aria-label="Level" className="grid grid-cols-3 gap-2">
            {PLAN_LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={level === value}
                disabled={generating}
                onClick={() => setLevel(value)}
                className={cx(
                  'focus-ring app-no-drag flex min-h-[72px] flex-col items-start justify-center rounded-md border p-3 text-left disabled:pointer-events-none disabled:opacity-40',
                  level === value ? 'border-accent bg-accent-subtle' : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <span className="text-base font-semibold text-fg">{PLAN_LEVEL_LABELS[value]}</span>
                <span className="text-sm text-fg-muted">{LEVEL_LINES[value]}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Size" aside="problems per topic">
          <div role="radiogroup" aria-label="Size per topic" className="inline-flex rounded-sm border border-line bg-sunken p-0.5">
            {SIZES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={size === value}
                disabled={generating}
                onClick={() => setSize(value)}
                className={cx(
                  'focus-ring app-no-drag h-7 w-14 rounded-xs text-base tabular-nums disabled:pointer-events-none',
                  size === value ? 'bg-raised font-semibold text-fg' : 'text-fg-secondary hover:text-fg',
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </Section>
      </div>

      {/* Sticks to the bottom of the scrolling area so the button is always in reach. */}
      <div className="sticky bottom-0 -mx-6 mt-2 border-t border-line bg-canvas px-6 py-3 min-[960px]:-mx-10 min-[960px]:px-10">
        <div className="flex max-w-[640px] flex-col gap-2">
          {error && (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <InlineError message={error} />
              </div>
              <Button size="sm" onClick={() => void generate()}>
                Try again
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-base text-fg-muted">{summaryLine(topics.map(countOf), size)}</span>
            <Button variant="primary" size="lg" loading={generating} disabled={topics.length === 0} onClick={() => void generate()}>
              {generating ? 'Para is picking problems…' : 'Generate plan'}
            </Button>
          </div>
        </div>
      </div>
    </Page>
  );
}
