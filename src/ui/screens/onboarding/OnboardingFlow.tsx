import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import { DEFAULT_SETTINGS, timeOfDaySchema } from '../../../core/settings';
import { renderHatching } from '../../../core/sprite';
import type { TodayView } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { useHatchingStep } from '../../components/Hatching';
import { Card } from '../../components/Layout';
import { PixelCanvas, Sprite } from '../../components/Sprite';
import { SpeechBubble } from '../../components/SpeechBubble';
import { cx } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { Row } from '../settings/SettingsParts';

const MIN_KEY_LENGTH = 10;
const MAX_KEY_LENGTH = 300;
const TOO_LONG_MESSAGE = 'That is too long to be an API key.';
const TIME_MESSAGE = 'Use a 24-hour time like 16:00';
/** Six frames at this pace make about 1.5 seconds. */
const HATCH_FRAME_MS = 300;
const ART_SIZE = 192;

type Step = 'egg' | 'meet' | 'reminders' | 'key';
const STEP_NUMBER: Record<Step, number> = {
  egg: 1,
  meet: 2,
  reminders: 3,
  key: 4,
};
type Times = { first: string; evening: string };

/** Moves focus to the step's one primary button when the step appears, so Enter moves on. */
function useFocusOnAppear(): Ref<HTMLButtonElement> {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2" aria-hidden data-testid="onboarding-dots">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx(
            'h-2 w-2 rounded-full',
            i + 1 === current ? 'bg-accent' : i + 1 < current ? 'bg-accent/50' : 'bg-line',
          )}
        />
      ))}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function PlayingEgg({ seed, onDone }: { seed: number; onDone: () => void }) {
  const step = useHatchingStep(HATCH_FRAME_MS, onDone);
  return (
    <PixelCanvas
      frame={renderHatching(seed, step)}
      size={ART_SIZE}
      label="Para hatching"
      decorative
      testId="onboarding-hatching"
    />
  );
}

function EggStep({ seed, onNext }: { seed: number; onNext: () => void }) {
  const [playing, setPlaying] = useState(false);
  const focus = useFocusOnAppear();

  function hatch(): void {
    if (playing) return;
    // With reduced motion the egg stays still and Para is simply there.
    if (prefersReducedMotion()) onNext();
    else setPlaying(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={hatch}
        disabled={playing}
        aria-label="Hatch the egg"
        className="focus-ring app-no-drag rounded-md"
        data-testid="onboarding-egg"
      >
        {playing ? (
          <PlayingEgg seed={seed} onDone={onNext} />
        ) : (
          <PixelCanvas
            frame={renderHatching(seed, 0)}
            size={ART_SIZE}
            label="An egg"
            decorative
            testId="onboarding-hatching"
          />
        )}
      </button>
      <p className="mt-4 font-pixel text-[10px] leading-4 text-fg">Something is moving…</p>
      <Button ref={focus} variant="primary" size="lg" className="mt-6 min-w-32" onClick={hatch} disabled={playing}>
        {playing ? 'Hatching…' : 'Hatch'}
      </Button>
    </>
  );
}

function MeetStep({ seed, onNext }: { seed: number; onNext: () => void }) {
  const focus = useFocusOnAppear();
  return (
    <>
      <div className="relative" style={{ width: ART_SIZE, height: ART_SIZE }}>
        <Sprite seed={seed} stage="egg" mood="content" size={ART_SIZE} animated testId="onboarding-para" />
        <div className="absolute top-2 left-[calc(100%-40px)] w-[164px] text-left" data-testid="onboarding-bubble">
          <SpeechBubble tail="left" className="max-w-full">
            Hi! I&apos;m Para. Feed me one problem a day.
          </SpeechBubble>
        </div>
      </div>
      <p className="mt-6 max-w-[400px] text-base text-fg-secondary">
        Solve one problem a day and Para gets fed. Para remembers what you solved and brings it back for review at the
        right time.
      </p>
      <Button ref={focus} variant="primary" size="lg" className="mt-6" onClick={onNext}>
        Nice to meet you
      </Button>
    </>
  );
}

type TimeKey = 'first' | 'evening';

function RemindersStep({
  initial,
  onFinish,
  saving,
  saveError,
}: {
  initial: { first: string; evening: string };
  onFinish: (times: Times) => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [times, setTimes] = useState(initial);
  const [errors, setErrors] = useState<Record<TimeKey, string | null>>({
    first: null,
    evening: null,
  });
  const focus = useFocusOnAppear();

  const check = (value: string): string | null => (timeOfDaySchema.safeParse(value).success ? null : TIME_MESSAGE);

  function setTime(key: TimeKey, value: string): void {
    setTimes((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: null }));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const next = { first: check(times.first), evening: check(times.evening) };
    setErrors(next);
    if (next.first === null && next.evening === null) onFinish(times);
  }

  const field = (key: TimeKey, label: string) => (
    <Row label={label} error={errors[key]}>
      <div className="w-24">
        <Input
          aria-label={label}
          aria-invalid={errors[key] !== null}
          invalid={errors[key] !== null}
          value={times[key]}
          onChange={(event) => setTime(key, event.target.value)}
          onBlur={() => setErrors((current) => ({ ...current, [key]: check(times[key]) }))}
          className="text-center tabular-nums"
          autoComplete="off"
          spellCheck={false}
          maxLength={5}
          disabled={saving}
        />
      </div>
    </Row>
  );

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col items-center" aria-label="Reminders">
      <h1 className="text-lg font-semibold text-fg">When should Para remind you?</h1>
      <Card padding="none" className="mt-4 w-full divide-y divide-line-subtle text-left">
        {field('first', 'First reminder')}
        {field('evening', 'Evening reminder')}
      </Card>
      <p className="mt-2 text-sm text-fg-muted">At most two a day. Skipped once Para is fed.</p>
      {saveError && (
        <p role="alert" className="mt-3 text-sm text-hard-text">
          {saveError}
        </p>
      )}
      <Button ref={focus} type="submit" variant="primary" size="lg" className="mt-6" loading={saving}>
        {saving ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}

/**
 * The optional last step: the key is saved through the bridge, never kept in the page. A failed
 * finish is shown here too, since the buttons on this step are the ones that finish the flow.
 */
function KeyStep({
  onSave,
  onFinish,
  busy,
  keySaved,
  finishError,
}: {
  onSave: (apiKey: string) => Promise<string | null>;
  onFinish: () => void;
  busy: boolean;
  keySaved: boolean;
  finishError: string | null;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = saving || busy;
  const fieldRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  // The field is disabled while saving, which drops focus: hand it back once it can take it.
  useEffect(() => {
    if (!working && refocus.current) {
      refocus.current = false;
      fieldRef.current?.focus();
    }
  }, [working]);
  // Focus goes to the field when the step appears, and to "Try again" once the failed finish
  // leaves it enabled (it is busy while the first finish is still running).
  useEffect(() => {
    if (!keySaved) fieldRef.current?.focus();
  }, [keySaved]);
  useEffect(() => {
    if (keySaved && !busy) retryRef.current?.focus();
  }, [keySaved, busy]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (working || value.trim().length < MIN_KEY_LENGTH) return;
    // Refused here, in plain words, without sending it; the field keeps what was typed.
    if (value.length > MAX_KEY_LENGTH) {
      setError(TOO_LONG_MESSAGE);
      return;
    }
    const apiKey = value;
    // Cleared at once so the typed key is not left in the page, whatever the answer is.
    setValue('');
    setError(null);
    setSaving(true);
    refocus.current = true;
    const refused = await onSave(apiKey);
    setError(refused);
    setSaving(false);
  }

  if (keySaved) {
    return (
      <div className="flex w-full flex-col items-center" aria-label="API key">
        <h1 className="text-lg font-semibold text-fg">Want learning plans?</h1>
        <p className="mt-2 max-w-[400px] text-base text-fg-secondary">Your key is saved.</p>
        {finishError && (
          <p role="alert" className="mt-3 max-w-[400px] text-sm text-hard-text">
            {finishError}
          </p>
        )}
        <Button
          ref={retryRef}
          type="button"
          variant="primary"
          size="lg"
          className="mt-6"
          loading={busy}
          disabled={busy}
          onClick={onFinish}
        >
          {busy ? 'Saving…' : 'Try again'}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex w-full flex-col items-center"
      aria-label="API key"
    >
      <h1 className="text-lg font-semibold text-fg">Want learning plans?</h1>
      <p className="mt-2 max-w-[400px] text-base text-fg-secondary">
        Pick topics and Para asks Claude for a staged list of real problems. That needs your own Anthropic API key.
        Everything else works without one, and you can add it later in Settings.
      </p>
      <Field label="Anthropic API key" className="mt-5 w-full text-left">
        <Input
          ref={fieldRef}
          type="password"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          invalid={error !== null}
          aria-invalid={error !== null}
          autoComplete="off"
          spellCheck={false}
          disabled={working}
        />
      </Field>
      {(error ?? finishError) && (
        <p role="alert" className="mt-1 w-full text-left text-sm text-hard-text">
          {error ?? finishError}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={saving}
          disabled={working || value.trim().length < MIN_KEY_LENGTH}
        >
          {saving ? 'Saving…' : 'Save key'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={working}
          onClick={() => {
            setError(null);
            onFinish();
          }}
        >
          Skip for now
        </Button>
      </div>
    </form>
  );
}

/**
 * The first-launch flow (PRD section 11, design section 10): hatch the egg, meet Para, pick the
 * reminder times. Finishing marks Para hatched; the parent then shows the app.
 */
export function OnboardingFlow({ seed, onFinished }: { seed: number; onFinished: (today: TodayView) => void }) {
  const [step, setStep] = useState<Step>('egg');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [times, setTimes] = useState<Times | null>(null);
  // Set once the key is stored, so a failed finish retries the finish and never saves it twice.
  const [keySaved, setKeySaved] = useState(false);
  // Decided once: null until the answer comes. A slow or failed answer never holds the first
  // three steps back; if it is still missing when the reminders are done, the flow has three.
  const [withKeyStep, setWithKeyStep] = useState<boolean | null>(null);
  const settings = useBridgeQuery(() => api().getSettings());

  useEffect(() => {
    let live = true;
    api()
      .getPlanOverview()
      .then(
        (overview) => {
          if (live) setWithKeyStep((current) => current ?? (overview.llm.canStoreKey && !overview.llm.hasKey));
        },
        () => {
          if (live) setWithKeyStep((current) => current ?? false);
        },
      );
    return () => {
      live = false;
    };
  }, []);

  async function finish(chosen: Times): Promise<string | null> {
    setSaving(true);
    setSaveError(null);
    try {
      const today = await api().completeOnboarding({
        firstReminderTime: chosen.first,
        eveningReminderTime: chosen.evening,
      });
      onFinished(today);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      setSaving(false);
      return message;
    }
  }

  async function finishReminders(chosen: Times): Promise<void> {
    if (withKeyStep !== true) {
      setWithKeyStep(false);
      await finish(chosen);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api().updateSettings({
        firstReminderTime: chosen.first,
        eveningReminderTime: chosen.evening,
      });
      setTimes(chosen);
      setStep('key');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
    setSaving(false);
  }

  async function saveKey(apiKey: string): Promise<string | null> {
    // Held in the parent too, so the top-right Skip cannot finish the flow while the key is saving.
    setSaving(true);
    try {
      await api().saveApiKey({ apiKey });
    } catch (error) {
      setSaving(false);
      return error instanceof Error ? error.message : String(error);
    }
    setKeySaved(true);
    // A failed finish shows its own message on this step; the key is saved either way.
    await finish(times ?? saved);
    return null;
  }

  // The times already in Settings are the starting point and what "Skip" keeps. On a new install
  // they are the defaults; someone who set their own times before hatching keeps them.
  const saved: Times = {
    first: settings.data?.firstReminderTime ?? DEFAULT_SETTINGS.firstReminderTime,
    evening: settings.data?.eveningReminderTime ?? DEFAULT_SETTINGS.eveningReminderTime,
  };
  const total = withKeyStep === true ? 4 : 3;

  return (
    <div className="flex h-full flex-col bg-canvas" data-testid="onboarding">
      <div className="app-drag h-[52px] shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-8">
        <div className="relative flex w-[440px] max-w-full flex-col items-center text-center">
          <div className="relative mb-6 flex h-6 w-full items-center justify-center">
            <ProgressDots current={STEP_NUMBER[step]} total={total} />
            {(step === 'reminders' || step === 'key') && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-0"
                disabled={saving}
                onClick={() => void finish(step === 'key' ? (times ?? saved) : saved)}
              >
                Skip
              </Button>
            )}
          </div>
          <div className="sr-only" role="status" data-testid="onboarding-step">
            Step {STEP_NUMBER[step]} of {total}
          </div>
          {/* Keyed so each step is new: its primary button takes focus when it appears. */}
          <div key={step} className="flex min-h-[320px] w-full flex-col items-center">
            {step === 'egg' && <EggStep seed={seed} onNext={() => setStep('meet')} />}
            {step === 'meet' && <MeetStep seed={seed} onNext={() => setStep('reminders')} />}
            {step === 'reminders' && (
              <RemindersStep
                initial={saved}
                onFinish={(t) => void finishReminders(t)}
                saving={saving}
                saveError={saveError}
              />
            )}
            {step === 'key' && (
              <KeyStep
                onSave={saveKey}
                onFinish={() => void finish(times ?? saved)}
                busy={saving}
                keySaved={keySaved}
                finishError={saveError}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
