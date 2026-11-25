import { CircleAlert, CircleCheck } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { DataInfo, DataSummary, ImportChoice } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { plural } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { Group, Row } from './SettingsParts';

type Offer = Extract<ImportChoice, { ok: true }>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The file's name; a full path would overflow the row. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** "Mar 2, 2026" for a ParaLeet day. Backups can span years, so the year is shown. */
function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)));
}

/** The rows of the comparison. A database with no attempts says so instead of listing zeros. */
const SUMMARY_ROWS: { label: string; value: (summary: DataSummary) => string }[] = [
  { label: 'Attempts', value: (s) => String(s.attempts) },
  { label: 'Problems', value: (s) => String(s.problems) },
  { label: 'First day', value: (s) => (s.firstDay ? dayLabel(s.firstDay) : '') },
  { label: 'Last day', value: (s) => (s.lastDay ? dayLabel(s.lastDay) : '') },
  { label: 'Longest streak', value: (s) => plural(s.longestStreak, 'day') },
];

const isEmpty = (summary: DataSummary): boolean =>
  summary.attempts === 0 || summary.firstDay === null || summary.lastDay === null;

/** What is in the file next to what is in the app now, one column each, so the user can tell which is which. */
function Comparison({ incoming, current }: { incoming: DataSummary; current: DataSummary }) {
  const cell = (summary: DataSummary, index: number, value: string) =>
    isEmpty(summary) ? (index === 0 ? 'No attempts yet' : '\u2013') : value;
  return (
    <table className="w-full rounded-md border border-line-subtle bg-sunken text-left text-base">
      <thead>
        <tr className="section-label">
          <th className="py-2 pl-3 font-normal">
            <span className="sr-only">What</span>
          </th>
          <th className="py-2 pr-3 font-normal">In the file</th>
          <th className="py-2 pr-3 font-normal">In ParaLeet now</th>
        </tr>
      </thead>
      <tbody>
        {SUMMARY_ROWS.map((row, index) => (
          <tr key={row.label} className="border-t border-line-subtle">
            <th scope="row" className="py-1 pl-3 pr-3 text-sm font-normal text-fg-muted">
              {row.label}
            </th>
            <td className="py-1 pr-3 text-fg">{cell(incoming, index, row.value(incoming))}</td>
            <td className="py-1 pr-3 text-fg">{cell(current, index, row.value(current))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Stage = 'asking' | 'applying' | 'failed' | 'restarting';

/** The confirm dialog for replacing the data. It cannot be closed while the import runs or the app restarts. */
function ImportDialog({ offer, info, onClose }: { offer: Offer; info: DataInfo | undefined; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('asking');
  const [failure, setFailure] = useState('');
  const running = useRef(false);

  function cancel(): void {
    if (stage === 'applying' || stage === 'restarting') return;
    // After a failure main has already forgotten the file.
    if (stage === 'asking')
      api()
        .cancelImport()
        .catch(() => undefined);
    onClose();
  }

  async function apply(): Promise<void> {
    if (running.current) return;
    running.current = true;
    setStage('applying');
    try {
      await api().applyImport();
      setStage('restarting');
    } catch (error) {
      setFailure(messageOf(error));
      setStage('failed');
      running.current = false;
    }
  }

  const backupName = info?.importBackupName;
  let body: ReactNode;
  let footer: ReactNode;
  if (stage === 'restarting') {
    body = <p className="text-base text-fg">Restarting…</p>;
  } else if (stage === 'failed') {
    body = (
      <div className="space-y-2">
        <p role="alert" className="text-base text-hard-text">
          {failure}
        </p>
        <p className="text-sm text-fg-secondary">To try again, close this and choose the file with Import… again.</p>
      </div>
    );
    footer = (
      <Button data-autofocus onClick={cancel}>
        Close
      </Button>
    );
  } else {
    const busy = stage === 'applying';
    body = (
      <div className="space-y-3">
        <Comparison incoming={offer.incoming} current={offer.current} />
        <p className="text-base text-fg">The data in ParaLeet now will be replaced by the data in the file.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
          <li>
            Your current data is kept as a backup file
            {backupName && (
              <>
                {' '}
                named <span className="text-fg">{backupName}</span>
              </>
            )}
            , next to the database.
          </li>
          {info?.hasImportBackup && <li>That replaces the backup kept from your earlier import.</li>}
          <li>ParaLeet restarts when the import is done.</li>
        </ul>
      </div>
    );
    footer = (
      <>
        <Button onClick={cancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" data-autofocus loading={busy} onClick={() => void apply()}>
          Replace my data
        </Button>
      </>
    );
  }

  return (
    <Modal
      title={stage === 'restarting' ? 'Replacing your data' : 'Replace your data?'}
      subtitle={<span className="break-all">{offer.fileName}</span>}
      onClose={cancel}
      width={520}
      footer={footer}
    >
      {body}
    </Modal>
  );
}

/**
 * The "Data" group: save a copy of everything, replace everything from a copy, and show where the
 * database file is. No path ever goes to the bridge; main owns every file dialog.
 */
export function DataGroup() {
  const dataInfo = useBridgeQuery(() => api().getDataInfo());
  const info = dataInfo.data;

  const [exporting, setExporting] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [choosing, setChoosing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // The details are kept from the moment the dialog opened, so a refresh behind it never changes what it says.
  const [offer, setOffer] = useState<{
    choice: Offer;
    info: DataInfo | undefined;
  } | null>(null);

  const [finderError, setFinderError] = useState<string | null>(null);

  async function exportCopy(): Promise<void> {
    if (exporting) return;
    setExporting(true);
    setSavedName(null);
    setExportError(null);
    try {
      const result = await api().exportData();
      if (result.saved) setSavedName(baseName(result.path));
    } catch (error) {
      setExportError(messageOf(error));
    } finally {
      setExporting(false);
    }
  }

  async function chooseFile(): Promise<void> {
    if (choosing) return;
    setChoosing(true);
    setImportError(null);
    try {
      const choice = await api().chooseImport();
      if (!choice.chosen) return;
      if (choice.ok) setOffer({ choice, info });
      else setImportError(`${choice.fileName} was not imported. ${choice.reason} Nothing was changed.`);
    } catch (error) {
      setImportError(`${messageOf(error)} Nothing was changed.`);
    } finally {
      setChoosing(false);
    }
  }

  async function showInFinder(): Promise<void> {
    setFinderError(null);
    try {
      await api().showDataInFinder();
    } catch (error) {
      setFinderError(messageOf(error));
    }
  }

  const last = info?.lastImport ?? null;

  return (
    <>
      <Group title="Data" note="Your API key is not part of the copy.">
        {last && (
          <div className="flex items-start gap-2.5 px-4 py-2.5">
            {last.status === 'applied' ? (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-easy" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-medium" aria-hidden />
            )}
            <p role="status" className="min-w-0 text-base text-fg">
              {last.status === 'applied'
                ? `Your import is done. Your earlier data is kept as ${info?.importBackupName ?? 'a backup file'}, next to the database.`
                : `The import was not applied. ${last.reason} Your data was not changed.`}
            </p>
          </div>
        )}
        <Row
          label="Export data"
          description="Save a copy of all your data as one file."
          error={exportError}
          notice={savedName ? `Saved as ${savedName}.` : undefined}
        >
          <Button loading={exporting} onClick={() => void exportCopy()}>
            Export…
          </Button>
        </Row>
        <Row label="Import data" description="Replace your data with a copy you saved earlier." error={importError}>
          <Button loading={choosing} onClick={() => void chooseFile()}>
            Import…
          </Button>
        </Row>
        <Row label="Where your data is" error={finderError} stacked>
          {info ? (
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm break-all text-fg-muted" title={info.path}>
                {info.path}
              </p>
              <Button variant="ghost" className="shrink-0" onClick={() => void showInFinder()}>
                Show in Finder
              </Button>
            </div>
          ) : dataInfo.error ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm text-fg-muted">The data details could not be read.</p>
              <Button variant="ghost" className="shrink-0" onClick={dataInfo.reload}>
                Try again
              </Button>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">Loading…</p>
          )}
        </Row>
      </Group>
      {offer && <ImportDialog offer={offer.choice} info={offer.info} onClose={() => setOffer(null)} />}
    </>
  );
}
