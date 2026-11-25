import { useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { InlineError } from './notices';

/** Asks before a plan is archived or deleted. A failure stays in the dialog. */
export function ConfirmDialog({
  title,
  line,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  line: string;
  confirmLabel: string;
  /** Resolves when done; the caller closes the dialog by leaving the view or by `onClose`. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
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
          <Button variant="danger" loading={busy} onClick={() => void confirm()}>
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
