import { Button } from '../../components/Button';

export function Loading() {
  return <div className="p-4 text-base text-fg-muted">Loading…</div>;
}

/** The overview or a plan could not be read: the message and a way to try again. */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-md border border-line bg-surface p-4 text-base text-hard-text"
    >
      <span className="min-w-0 flex-1">Something went wrong: {message}</span>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** A failed command: the message as it came, in red text. */
export function InlineError({ message }: { message: string }) {
  return (
    <div role="alert" className="text-base text-hard-text">
      {message}
    </div>
  );
}
