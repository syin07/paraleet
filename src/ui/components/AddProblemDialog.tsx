// "Add a problem": paste a link, see what ParaLeet recognizes, fill in the rest. Shared by the
// Problems screen and Today's quick log (docs/design-references.md, section 5).
import { Check } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { ParsedProblemUrl, ProblemSummary } from '../../bridge/contract';
import { TOPICS, type TopicId } from '../../core/topics';
import { api } from '../bridge';
import { cx, problemTitle } from '../lib/format';
import { DifficultyText, PlatformBadge, TopicChips } from './Badges';
import { Button } from './Button';
import { Field, Input } from './Field';
import { Modal } from './Modal';

const MAX_TOPICS = 10;
const TYPING_PAUSE_MS = 300;
const LEVELS = ['Easy', 'Medium', 'Hard'] as const;

type Recognized = Extract<ParsedProblemUrl, { ok: true }>;

export interface AddProblemDialogProps {
  /** A link to start with, for example one the user just copied. */
  initialUrl?: string;
  /** Called with the problem to show next. `created` is false when the app already had it. */
  onAdded: (problem: ProblemSummary, created: boolean, report: boolean) => void;
  /** Starts with "I solved it today" ticked, as when the dialog is opened from quick log. */
  solvedToday?: boolean;
  onClose: () => void;
}

export function AddProblemDialog({ initialUrl = '', solvedToday = false, onAdded, onClose }: AddProblemDialogProps) {
  const formId = useId();
  const [url, setUrl] = useState(initialUrl);
  // The text that was last sent to parseProblemUrl, and what came back for it.
  const [probe, setProbe] = useState(initialUrl);
  const [parsed, setParsed] = useState<{ url: string; result: ParsedProblemUrl } | null>(null);

  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<(typeof LEVELS)[number] | null>(null);
  const [rating, setRating] = useState('');
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [report, setReport] = useState(solvedToday);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Wait for a short pause in typing, then ask what the link is.
  useEffect(() => {
    if (url === probe) return;
    const timer = window.setTimeout(() => setProbe(url), TYPING_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [url, probe]);

  useEffect(() => {
    const text = probe.trim();
    if (text === '') return;
    let current = true;
    api()
      .parseProblemUrl({ url: text })
      .then(
        (result) => {
          if (current) setParsed({ url: text, result });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : String(cause);
          if (current) setParsed({ url: text, result: { ok: false, reason } });
        },
      );
    return () => {
      current = false;
    };
  }, [probe]);

  // A new link starts a new form.
  function changeUrl(next: string): void {
    setUrl(next);
    setTitle('');
    setLevel(null);
    setRating('');
    setTopics([]);
    setSubmitError(null);
  }

  const settled = parsed !== null && parsed.url === url.trim();
  const result = settled ? parsed.result : null;
  const urlError = result && !result.ok ? result.reason : null;
  const recognized: Recognized | null = result?.ok ? result : null;
  const known = recognized?.known ?? null;

  function difficultyRaw(): string | null {
    if (!recognized) return null;
    if (recognized.platform === 'codeforces') return rating.trim() === '' ? null : rating.trim();
    if (recognized.platform === 'cses') return null;
    return level;
  }

  const ratingProblem =
    recognized?.platform === 'codeforces' && rating.trim() !== '' && !(/^[1-9]\d*$/.test(rating.trim()) && Number(rating) >= 800 && Number(rating) <= 3500)
      ? 'Use a whole number from 800 to 3500'
      : null;
  const canAdd = recognized !== null && (known !== null || (title.trim() !== '' && !ratingProblem));

  async function submit(): Promise<void> {
    if (!recognized || !canAdd) return;
    if (known) {
      onAdded(known, false, report);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const added = await api().addProblem({
        url: recognized.canonicalUrl,
        title: title.trim(),
        difficultyRaw: difficultyRaw(),
        topics,
      });
      if (added.ok) onAdded(added.problem, added.created, report);
      else setSubmitError(added.reason);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Add a problem"
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!canAdd} loading={submitting}>
            {known ? (report ? 'Report it' : 'Open it') : report ? 'Add and report' : 'Add problem'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Problem link" error={urlError} hint="LeetCode, CSES, Codeforces, or any other link">
          <Input
            size="lg"
            data-autofocus
            autoFocus
            placeholder="https://leetcode.com/problems/…"
            value={url}
            invalid={Boolean(urlError)}
            onChange={(event) => changeUrl(event.target.value)}
            onPaste={(event) => {
              // A paste is a whole link: look it up now instead of after the pause.
              const pasted = event.clipboardData.getData('text');
              if (pasted) window.setTimeout(() => setProbe(event.currentTarget?.value ?? pasted), 0);
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        {recognized && (
          <div className="flex items-center gap-2 text-base text-fg-secondary" data-testid="recognition">
            <PlatformBadge platform={recognized.platform} />
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                known ? 'bg-easy' : 'bg-line-strong',
              )}
              aria-hidden
            />
            <span>
              {known
                ? 'ParaLeet already knows this problem'
                : recognized.platform === 'other'
                  ? 'Other site'
                  : 'New problem'}
            </span>
            {!known && (
              <span
                className="ml-auto min-w-0 truncate pl-3 font-mono text-sm text-fg-muted"
                title={recognized.platformId}
                data-testid="platform-id"
              >
                {recognized.platformId}
              </span>
            )}
          </div>
        )}

        {known && (
          <div className="rounded-md border border-line-subtle bg-sunken p-3" data-testid="known-problem">
            <div className="text-md font-semibold text-fg">{problemTitle(known)}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <DifficultyText raw={known.difficultyRaw} norm={known.difficultyNorm} />
              <TopicChips topics={known.topics} max={3} />
            </div>
            {recognized?.alreadyLogged && (
              <div className="mt-2 text-sm text-fg-secondary">Already in your problems</div>
            )}
          </div>
        )}

        {recognized && !known && (
          <div className="space-y-4" data-testid="new-problem-fields">
            <Field label="Title">
              <Input
                aria-label="Title"
                placeholder="What is the problem called?"
                maxLength={300}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            {recognized.platform === 'codeforces' && (
              <Field label="Rating" error={ratingProblem} hint="Optional, from 800 to 3500">
                <Input
                  aria-label="Rating"
                  inputMode="numeric"
                  placeholder="1400"
                  value={rating}
                  invalid={Boolean(ratingProblem)}
                  onChange={(event) => setRating(event.target.value)}
                  className="w-32"
                />
              </Field>
            )}

            {(recognized.platform === 'leetcode' || recognized.platform === 'other') && (
              <div>
                <div className="mb-1.5 text-sm text-fg-secondary">Difficulty</div>
                <div
                  role="radiogroup"
                  aria-label="Difficulty"
                  className="inline-flex gap-0.5 rounded-sm bg-sunken p-0.5"
                >
                  {LEVELS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={level === value}
                      onClick={() => setLevel(level === value ? null : value)}
                      className={cx(
                        'focus-ring h-7 rounded-xs px-3 text-base transition-colors duration-100',
                        level === value ? 'bg-raised text-fg' : 'text-fg-secondary hover:text-fg',
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm text-fg-secondary">
                <span>Topics</span>
                <span className="text-fg-muted">{topics.length > 0 ? `${topics.length} of ${MAX_TOPICS}` : `Up to ${MAX_TOPICS}`}</span>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topics">
                {TOPICS.map((topic) => {
                  const selected = topics.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={!selected && topics.length >= MAX_TOPICS}
                      onClick={() =>
                        setTopics(selected ? topics.filter((id) => id !== topic.id) : [...topics, topic.id])
                      }
                      className={cx(
                        'focus-ring inline-flex h-6 items-center gap-1 rounded-xs border px-2 text-sm transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40',
                        selected
                          ? 'border-accent-border bg-accent-subtle text-fg'
                          : 'border-line bg-sunken text-fg-secondary hover:bg-raised',
                      )}
                    >
                      {selected && <Check className="h-3 w-3 text-accent" aria-hidden />}
                      {topic.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {recognized && (
          <label className="flex cursor-pointer items-center gap-2 text-base text-fg">
            <input
              type="checkbox"
              checked={report}
              onChange={(event) => setReport(event.target.checked)}
              className="focus-ring app-no-drag h-4 w-4 cursor-pointer accent-accent"
            />
            I solved it today
          </label>
        )}

        {submitError && (
          <p role="alert" className="text-sm text-hard-text">
            {submitError}
          </p>
        )}
      </form>
    </Modal>
  );
}
