// The detail drawer for one problem: link, attempts, key insight, tags, notes, own solution.
import { ExternalLink, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProblemDetail } from '../../../bridge/contract';
import { RATING_LABELS, type ProblemNotes, type Rating } from '../../../core/types';
import { api } from '../../bridge';
import { DifficultyText, NeutralBadge, PlatformBadge, TopicChips } from '../../components/Badges';
import { Button } from '../../components/Button';
import { Drawer, DrawerSection } from '../../components/Drawer';
import { Input, Textarea } from '../../components/Field';
import { cx, formatDay, problemTitle } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

const RATING_DOT: Record<Rating, string> = {
  again: 'bg-line-strong',
  hard: 'bg-medium',
  good: 'bg-easy',
  easy: 'bg-easy',
};

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Notes the user typed that could not be saved when the drawer closed. */
export interface FailedSave {
  problemId: number;
  draft: Draft;
  message: string;
}

/**
 * The screen gives each opening of the drawer its own `key`, so this always starts with a fresh
 * fetch and never shows a detail loaded before the last save.
 */
export function ProblemDrawer({
  problemId,
  restore,
  onRestoreUsed,
  onSaveFailed,
  onClose,
}: {
  problemId: number;
  /** Text from a save that failed while the drawer was closing: shown again, with its error. */
  restore: FailedSave | null;
  onRestoreUsed: () => void;
  onSaveFailed: (failed: FailedSave) => void;
  onClose: () => void;
}) {
  const detail = useBridgeQuery(() => api().getProblemDetail({ problemId }), [problemId]);
  const data = detail.data?.problem.id === problemId ? detail.data : undefined;

  return data ? (
    <Loaded
      detail={data}
      reload={detail.reload}
      restore={restore?.problemId === problemId ? restore : null}
      onRestoreUsed={onRestoreUsed}
      onSaveFailed={onSaveFailed}
      onClose={onClose}
    />
  ) : (
    <Drawer title={detail.error ? 'Could not load this problem' : 'Loading…'} onClose={onClose}>
      {detail.error && (
        <p role="alert" className="text-base text-hard-text">
          {detail.error}
        </p>
      )}
    </Drawer>
  );
}

export type Draft = Omit<ProblemNotes, 'problemId'>;

function toDraft(notes: ProblemNotes): Draft {
  return {
    keyInsight: notes.keyInsight,
    patternTags: notes.patternTags,
    notes: notes.notes,
    solutionUrl: notes.solutionUrl,
  };
}

function Loaded({
  detail,
  reload,
  restore,
  onRestoreUsed,
  onSaveFailed,
  onClose,
}: {
  detail: ProblemDetail;
  reload: () => void;
  restore: FailedSave | null;
  onRestoreUsed: () => void;
  onSaveFailed: (failed: FailedSave) => void;
  onClose: () => void;
}) {
  const { problem } = detail;
  const problemId = problem.id;
  // The drafts are what the user sees and types. Reloads after a save never overwrite them.
  const [draft, setDraft] = useState<Draft>(() => restore?.draft ?? toDraft(detail.notes));
  const draftRef = useRef(draft);
  // What the app has saved; a restored draft differs from it, so it counts as unsaved.
  const savedRef = useRef(JSON.stringify(toDraft(detail.notes)));
  const [error, setError] = useState<string | null>(restore?.message ?? null);
  // The notes text last saved. "Saved" shows only while the text on screen is that text.
  const [savedText, setSavedText] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'retire' | 'reset' | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(patch: Partial<Draft>): void {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
  }

  /** Sends every notes field at once, so saving one never wipes another. Returns an error message, or null. */
  const attempt = useCallback(async (): Promise<string | null> => {
    const current = draftRef.current;
    const snapshot = JSON.stringify(current);
    if (snapshot === savedRef.current) return null;
    try {
      await api().saveProblemNotes({
        problemId,
        keyInsight: current.keyInsight?.trim() || null,
        patternTags: current.patternTags,
        notes: current.notes?.trim() || null,
        solutionUrl: current.solutionUrl?.trim() || null,
      });
      savedRef.current = snapshot;
      setSavedText(current.notes ?? '');
      return null;
    } catch (cause) {
      return errorText(cause);
    }
  }, [problemId]);

  const save = useCallback(async (): Promise<boolean> => {
    const message = await attempt();
    setError(message);
    return message === null;
  }, [attempt]);

  const onSaveFailedRef = useRef(onSaveFailed);
  const onRestoreUsedRef = useRef(onRestoreUsed);
  useEffect(() => {
    onSaveFailedRef.current = onSaveFailed;
    onRestoreUsedRef.current = onRestoreUsed;
  });
  useEffect(() => {
    if (restore) onRestoreUsedRef.current();
    // Only on the first render of this restored drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save whatever is pending when the drawer closes or another problem is opened. If that save
  // fails, the screen opens the drawer again with the text and the error.
  useEffect(
    () => () => {
      const unsaved = draftRef.current;
      void attempt().then((message) => {
        if (message) onSaveFailedRef.current({ problemId, draft: unsaved, message });
      });
    },
    [attempt, problemId],
  );

  async function act(action: 'retire' | 'reset'): Promise<void> {
    setBusy(true);
    try {
      await (action === 'retire' ? api().retireCard({ problemId }) : api().resetCard({ problemId }));
      setError(null);
      setConfirm(null);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function openSolution(): Promise<void> {
    if (!(await save())) return;
    try {
      const result = await api().openSolutionLink({ problemId });
      setError(result.opened ? null : 'That link could not be opened. Use a full address that starts with https://');
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  const card = detail.card;
  const retired = card?.status === 'retired';

  return (
    <Drawer
      title={problemTitle(problem)}
      onClose={onClose}
      meta={
        <>
          <PlatformBadge platform={problem.platform} />
          {problem.difficultyRaw && <DifficultyText raw={problem.difficultyRaw} norm={problem.difficultyNorm} />}
          <TopicChips topics={problem.topics} max={3} />
          {retired && <NeutralBadge>Retired</NeutralBadge>}
        </>
      }
      actions={
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Open on platform"
          title="Open on platform"
          onClick={() => void api().openProblem({ problemId })}
          icon={<ExternalLink className="h-4 w-4" />}
        />
      }
      footer={
        card ? (
          confirm ? (
            <>
              <span className="min-w-0 flex-1 text-base text-fg-secondary">
                {confirm === 'retire' ? 'Stop reviewing this problem?' : 'Clear its review history and make it due again?'}
              </span>
              <Button size="sm" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant={confirm === 'reset' ? 'danger' : 'primary'}
                loading={busy}
                onClick={() => void act(confirm)}
              >
                {confirm === 'retire' ? 'Retire' : 'Reset'}
              </Button>
            </>
          ) : (
            <>
              {!retired && (
                <Button variant="ghost" size="sm" title="I've got this one" onClick={() => setConfirm('retire')}>
                  Retire card
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setConfirm('reset')}>
                Reset schedule
              </Button>
            </>
          )
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="rounded-sm border border-hard px-3 py-2 text-base text-hard-text">
          {error}
        </p>
      )}

      <DrawerSection label="Key insight">
        <Input
          aria-label="Key insight"
          placeholder="The trick, in one line"
          maxLength={300}
          value={draft.keyInsight ?? ''}
          onChange={(event) => edit({ keyInsight: event.target.value })}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </DrawerSection>

      <DrawerSection label="Pattern tags">
        <TagEditor
          tags={draft.patternTags}
          onChange={(patternTags) => {
            edit({ patternTags });
            void save();
          }}
        />
      </DrawerSection>

      <DrawerSection label="Attempts">
        <ol className="-mx-1">
          {detail.attempts.map((attempt) => (
            <li key={attempt.id} data-testid="attempt" className="border-b border-line-subtle px-1 py-2 last:border-b-0">
              <div className="flex min-h-5 items-center gap-3 text-base">
                <span className="w-24 shrink-0 text-fg">{formatDay(attempt.paraDay)}</span>
                <span className="inline-flex h-5 items-center gap-1.5 rounded-xs bg-sunken px-1.5 text-sm text-fg-secondary">
                  <span className={cx('h-2 w-2 rounded-full', RATING_DOT[attempt.rating])} aria-hidden />
                  {RATING_LABELS[attempt.rating]}
                </span>
                {attempt.minutes !== null && (
                  <span className="font-mono text-sm text-fg-secondary">{attempt.minutes} min</span>
                )}
                <span className="ml-auto text-sm text-fg-muted">
                  {attempt.kind === 'first_solve' ? 'first solve' : 'review'}
                </span>
              </div>
              {attempt.notes && <p className="mt-1 text-sm text-fg-muted">{attempt.notes}</p>}
            </li>
          ))}
          {detail.attempts.length === 0 && <li className="px-1 text-base text-fg-muted">No attempts yet.</li>}
        </ol>
      </DrawerSection>

      <DrawerSection label="Notes">
        <Textarea
          aria-label="Notes"
          rows={3}
          placeholder="Anything worth remembering"
          maxLength={5000}
          value={draft.notes ?? ''}
          onChange={(event) => edit({ notes: event.target.value })}
          onBlur={() => void save()}
        />
        <div className="mt-1 h-4 text-sm text-fg-muted">{savedText !== null && savedText === (draft.notes ?? '') ? 'Saved' : ''}</div>
      </DrawerSection>

      <DrawerSection label="My solution">
        <div className="flex items-center gap-2">
          <Input
            aria-label="Link to my solution"
            placeholder="https://github.com/…"
            maxLength={500}
            value={draft.solutionUrl ?? ''}
            onChange={(event) => edit({ solutionUrl: event.target.value })}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <Button disabled={!(draft.solutionUrl ?? '').trim()} onClick={() => void openSolution()}>
            Open
          </Button>
        </div>
      </DrawerSection>
    </Drawer>
  );
}

const MAX_TAGS = 20;

/** Adds every non-empty part, skipping repeats (any letter case) and stopping at the cap. `full` says a new tag was turned away by the cap. */
function mergeTags(tags: string[], parts: string[]): { tags: string[]; full: boolean } {
  const next = [...tags];
  let full = false;
  for (const part of parts) {
    const tag = part.trim().slice(0, 60);
    if (!tag) continue;
    if (next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue;
    if (next.length >= MAX_TAGS) {
      full = true;
      continue;
    }
    next.push(tag);
  }
  return { tags: next, full };
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');
  const [full, setFull] = useState(false);

  function add(parts: string[]): void {
    const next = mergeTags(tags, parts);
    setFull(next.full);
    if (next.tags.length !== tags.length) onChange(next.tags);
  }

  return (
    <div>
      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex h-6 items-center gap-1 rounded-xs bg-sunken pr-1 pl-2 text-sm text-fg-secondary"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  setFull(false);
                  onChange(tags.filter((item) => item !== tag));
                }}
                className="focus-ring flex h-4 w-4 items-center justify-center rounded-xs text-fg-muted hover:text-fg"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        aria-label="Add a pattern tag"
        placeholder="Add a tag, then press Enter"
        value={text}
        onChange={(event) => {
          // Everything before the last comma is a finished tag, added in one step (so a pasted
          // list keeps every tag); what follows stays in the field.
          const parts = event.target.value.split(',');
          const rest = parts.pop() ?? '';
          if (parts.length > 0) add(parts);
          setText(rest);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add([text]);
            setText('');
          }
        }}
        onBlur={() => {
          add([text]);
          setText('');
        }}
      />
      {full && <div className="mt-1 text-sm text-fg-muted">{MAX_TAGS} tags at most</div>}
    </div>
  );
}
