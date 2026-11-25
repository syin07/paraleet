import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import type { ApiKeyTest, LlmStatus } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Input, Select } from '../../components/Field';
import { useHashAction } from '../../lib/navigation';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { DraftInput, Group, Row } from './SettingsParts';
import type { RowKey } from './useSettingsModel';

/** The bridge refuses shorter keys; Save waits so the user is never refused for a half-typed key. */
const KEY_MIN_LENGTH = 10;
/** The select's value for "type another model ID". Not a valid model ID, so it can never clash with one. */
const OTHER = '__other__';

type TestState = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; result: ApiKeyTest };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Props {
  /** The saved plan model, as the settings model shows it. */
  model: string;
  /** Saves the model setting; resolves false when it was refused (the row's error is then set). */
  saveModel: (model: string) => Promise<boolean>;
  modelError: string | undefined;
  clearError: (key: RowKey) => void;
}

/**
 * The "Learning plans" group: the Anthropic API key (add, test, remove) and the model that writes
 * plans. The key's state comes from the plan overview; the key itself never comes back to the UI.
 */
export function LearningPlansGroup(props: Props) {
  const overview = useBridgeQuery(() => api().getPlanOverview());
  const [fresh, setFresh] = useState<{ loaded: unknown; status: LlmStatus }>();
  // A status returned by save or remove is newer than the loaded overview, until the next load replaces it.
  const status = fresh && fresh.loaded === overview.data ? fresh.status : overview.data?.llm;

  if (!status) {
    return (
      <Group title="Learning plans">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          {overview.error ? (
            <>
              <p role="alert" className="min-w-0 text-base text-hard-text">
                Could not read the API key setting: {overview.error}
              </p>
              <Button onClick={overview.reload}>Try again</Button>
            </>
          ) : (
            <p className="text-base text-fg-muted">Loading…</p>
          )}
        </div>
      </Group>
    );
  }

  return <LoadedGroup status={status} onStatus={(next) => setFresh({ loaded: overview.data, status: next })} {...props} />;
}

function LoadedGroup({ status, onStatus, model, saveModel, modelError, clearError }: Props & { status: LlmStatus; onStatus: (status: LlmStatus) => void }) {
  const [typedKey, setTypedKey] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  // A test result belongs to the key and model it ran with: once either changes it is not shown.
  const [ran, setRan] = useState<{ model: string; hasKey: boolean; state: TestState }>();
  const test: TestState = ran && ran.model === model && ran.hasKey === status.hasKey ? ran.state : { kind: 'idle' };
  const setTest = (state: TestState): void => setRan({ model, hasKey: status.hasKey, state });
  const keyRef = useRef<HTMLInputElement>(null);
  const testRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // The Plan screen's "Add API key" button lands here: show the row and put the cursor where the user acts next.
  const requests = useHashAction('settings', 'api-key');
  const handled = useRef(0);
  useEffect(() => {
    if (requests === handled.current) return;
    handled.current = requests;
    rowRef.current?.scrollIntoView({ block: 'center' });
    (status.hasKey ? testRef.current : keyRef.current)?.focus({ preventScroll: true });
  }, [requests, status.hasKey]);


  async function saveKey(): Promise<void> {
    if (keyBusy || typedKey.trim().length < KEY_MIN_LENGTH) return;
    setKeyBusy(true);
    setKeyError(null);
    try {
      onStatus(await api().saveApiKey({ apiKey: typedKey }));
      // Gone from the page as soon as it is stored.
      setTypedKey('');
    } catch (error) {
      setKeyError(messageOf(error));
    } finally {
      setKeyBusy(false);
    }
  }

  async function removeKey(): Promise<void> {
    setKeyBusy(true);
    setKeyError(null);
    try {
      onStatus(await api().removeApiKey());
    } catch (error) {
      setKeyError(messageOf(error));
    } finally {
      setKeyBusy(false);
    }
  }

  async function runTest(): Promise<void> {
    if (test.kind === 'running') return;
    setTest({ kind: 'running' });
    try {
      setTest({ kind: 'done', result: await api().testApiKey() });
    } catch (error) {
      setTest({ kind: 'done', result: { ok: false, reason: messageOf(error) } });
    }
  }

  const testing = test.kind === 'running';
  const failure = test.kind === 'done' && !test.result.ok ? test.result.reason : null;
  const worked = test.kind === 'done' && test.result.ok ? test.result : null;
  const notice = worked
    ? worked.modelAvailable
      ? 'The key works.'
      : 'The key works, but it cannot use the chosen model. Pick another model below.'
    : undefined;

  return (
    <Group title="Learning plans">
      <div ref={rowRef}>
        <Row
          label="Anthropic API key"
          description="Used only to build learning plans. Stored encrypted on this Mac. Everything else works without it."
          error={keyError ?? failure}
          notice={notice}
          stacked
        >
          {!status.canStoreKey ? (
            <div className="space-y-2.5">
              <p className="text-base text-fg-secondary">
                The key cannot be stored securely on this Mac, so learning plans are not available.
              </p>
              <KeyEntry disabled value="" onChange={() => undefined} onSave={() => undefined} inputRef={keyRef} />
              {status.hasKey && (
                <Button variant="ghost" disabled={keyBusy} onClick={() => void removeKey()}>
                  Remove
                </Button>
              )}
            </div>
          ) : status.hasKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 inline-flex items-center gap-1.5 text-base text-fg">
                <Check className="h-3.5 w-3.5 text-easy" aria-hidden />
                Saved, encrypted
              </span>
              <Button ref={testRef} loading={testing} disabled={keyBusy} onClick={() => void runTest()}>
                {testing ? 'Testing…' : 'Test'}
              </Button>
              <Button variant="ghost" disabled={keyBusy || testing} onClick={() => void removeKey()}>
                Remove
              </Button>
            </div>
          ) : (
            <KeyEntry
              value={typedKey}
              busy={keyBusy}
              onChange={(text) => {
                setTypedKey(text);
                setKeyError(null);
              }}
              onSave={() => void saveKey()}
              inputRef={keyRef}
            />
          )}
        </Row>
      </div>
      <ModelRow model={model} suggested={status.suggestedModels} saveModel={saveModel} error={modelError} clearError={clearError} />
    </Group>
  );
}

function KeyEntry({
  value,
  onChange,
  onSave,
  inputRef,
  disabled = false,
  busy = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
  inputRef: Ref<HTMLInputElement>;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Input
        ref={inputRef}
        type="password"
        aria-label="Anthropic API key"
        placeholder="Paste your key"
        autoComplete="off"
        spellCheck={false}
        className="max-w-[320px] flex-1"
        disabled={disabled || busy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button type="submit" variant="primary" loading={busy} disabled={disabled || value.trim().length < KEY_MIN_LENGTH}>
        Save
      </Button>
    </form>
  );
}

function ModelRow({
  model,
  suggested,
  saveModel,
  error,
  clearError,
}: {
  model: string;
  suggested: LlmStatus['suggestedModels'];
  saveModel: Props['saveModel'];
  error: string | undefined;
  clearError: Props['clearError'];
}) {
  const isSuggested = suggested.some((option) => option.id === model);
  const [otherChosen, setOtherChosen] = useState(false);
  // A refused ID resets the field, since the control goes back to the saved value.
  const [resets, setResets] = useState(0);
  const showOther = otherChosen || !isSuggested;

  return (
    <Row label="Model" description="The Claude model that picks problems for a plan." error={error}>
      <div className="flex w-[280px] flex-col gap-2">
        <Select
          aria-label="Model"
          value={showOther ? OTHER : model}
          onChange={(event) => {
            clearError('planModel');
            if (event.target.value === OTHER) {
              setOtherChosen(true);
              return;
            }
            setOtherChosen(false);
            void saveModel(event.target.value);
          }}
        >
          {suggested.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </Select>
        {showOther && (
          <DraftInput
            key={resets}
            label="Model ID"
            value={isSuggested ? '' : model}
            placeholder="Model ID, such as claude-opus-5-5"
            maxLength={100}
            invalid={error !== undefined}
            onEdit={() => clearError('planModel')}
            onCommit={async (text) => {
              const id = text.trim();
              if (id === model) return true;
              const saved = await saveModel(id);
              if (!saved) setResets((count) => count + 1);
              // Back to the saved value: a suggested model closes the text field, a typed one stays.
              setOtherChosen(!saved && !isSuggested);
              return saved;
            }}
          />
        )}
      </div>
    </Row>
  );
}
