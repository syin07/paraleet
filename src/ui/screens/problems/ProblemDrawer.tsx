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

export function ProblemDrawer({ problemId, onClose }: { problemId: number; onClose: () => void }) {
  const detail = useBridgeQuery(() => api().getProblemDetail({ problemId }), [problemId]);
  const data = detail.data?.problem.id === problemId ? detail.data : undefined;

  return data ? (
    <Loaded key={problemId} detail={data} reload={detail.reload} onClose={onClose} />
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

type Draft = Omit<ProblemNotes, 'problemId'>;

function toDraft(notes: ProblemNotes): Draft {
  return {
    keyInsight: notes.keyInsight,
    patternTags: notes.patternTags,
    notes: notes.notes,
    solutionUrl: notes.solutionUrl,
  };
}

function Loaded({ detail, reload, onClose }: { detail: ProblemDetail; reload: () => void; onClose: () => void }) {
  const { problem } = detail;
  const problemId = problem.id;
  // The drafts are what the user sees and types. Reloads after a save never overwrite them.
  const [draft, setDraft] = useState<Draft>(() => toDraft(detail.notes));
  const draftRef = useRef(draft);
  const savedRef = useRef(JSON.stringify(draft));
  const [error, setError] = useState<string | null>(null);
  const [savedNotes, setSavedNotes] = useState(false);
  const [confirm, setConfirm] = useState<'retire' | 'reset' | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(patch: Partial<Draft>): void {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
  }

  /** Sends every notes field at once, so saving one never wipes another. */
  const save = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    const snapshot = JSON.stringify(current);
    if (snapshot === savedRef.current) return true;
    try {
      await api().saveProblemNotes({
        problemId,
        keyInsight: current.keyInsight?.trim() || null,
        patternTags: current.patternTags,
        notes: current.notes?.trim() || null,
        solutionUrl: current.solutionUrl?.trim() || null,
      });
      savedRef.current = snapshot;
      setError(null);
      setSavedNotes(true);
      return true;
    } catch (cause) {
      setError(errorText(cause));
      return false;
    }
  }, [problemId]);

  // Save whatever is pending when the drawer closes or another problem is opened.
  useEffect(() => () => void save(), [save]);

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
          onChange={(event) => {
            edit({ notes: event.target.value });
            setSavedNotes(false);
          }}
          onBlur={() => void save()}
        />
        <div className="mt-1 h-4 text-sm text-fg-muted">{savedNotes ? 'Saved' : ''}</div>
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

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');

  function add(raw: string): void {
    const tag = raw.trim().slice(0, 60);
    setText('');
    if (!tag || tags.includes(tag) || tags.length >= 20) return;
    onChange([...tags, tag]);
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
                onClick={() => onChange(tags.filter((item) => item !== tag))}
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
          const value = event.target.value;
          if (value.includes(',')) {
            for (const part of value.split(',').slice(0, -1)) add(part);
            setText(value.slice(value.lastIndexOf(',') + 1));
          } else {
            setText(value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add(text);
          }
        }}
        onBlur={() => add(text)}
      />
    </div>
  );
}
