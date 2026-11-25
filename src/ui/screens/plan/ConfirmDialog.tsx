import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { InlineError } from './notices';

/** Asks before a plan is archived or deleted. A failure stays in the dialog. */
export function ConfirmDialog({
  title,
  line,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  onClose,
}: {
  title: string;
  line: string;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary';
  /** Resolves when done; the caller closes the dialog by leaving the view or by `onClose`. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Set at once, so a double-click cannot send the command twice before the button disables.
  const sent = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      sent.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={confirmVariant} loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-base text-fg-secondary">{line}</p>
      {error && (
        <div className="mt-3">
          <InlineError message={error} />
        </div>
      )}
    </Modal>
  );
}
