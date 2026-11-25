// Export and import of the whole database as one file, from Settings (PRD section 10).
//
// The UI never hands main a file path: the system's dialogs are asked here, and the file picked
// for an import is remembered in `ctx.session` until the user says yes or no. An import does not
// touch the open database. It is checked, copied next to it, and swapped in at the next launch,
// which `applyImport` asks for at once. See docs/decisions/0017-stats-and-data.md.
import { basename } from 'node:path';
import type { DataInfo, DataSummary, Done, ExportResult, ImportChoice } from '../../bridge/contract';
import {
  dataDirOf,
  exportDatabase,
  hasImportBackup,
  IMPORT_BACKUP_FILE_NAME,
  inspectDatabaseFile,
  samePath,
  stageImport,
  summarizeDatabase,
  TransferError,
  type DatabaseSummary,
} from '../../data';
import { currentMoment, type AppContext } from './context';

function toDataSummary(summary: DatabaseSummary): DataSummary {
  return {
    attempts: summary.attempts,
    problems: summary.problems,
    firstDay: summary.firstDay,
    lastDay: summary.lastDay,
    longestStreak: summary.longestStreak,
  };
}

export function getDataInfo(ctx: AppContext): DataInfo {
  return {
    path: ctx.db.path,
    summary: toDataSummary(summarizeDatabase(ctx.db)),
    hasImportBackup: hasImportBackup(dataDirOf(ctx.db)),
    importBackupName: IMPORT_BACKUP_FILE_NAME,
    lastImport: ctx.session.lastImport,
  };
}

/** Asks where to save, then writes a complete copy of the database there. The API key is not in it. */
export async function exportData(ctx: AppContext): Promise<ExportResult> {
  const { today } = currentMoment(ctx);
  const target = await ctx.files.chooseSavePath(`ParaLeet backup ${today}.sqlite3`);
  if (target === null) return { saved: false };
  try {
    exportDatabase(ctx.db, target);
  } catch (error) {
    if (error instanceof TransferError) throw error;
    // A folder that cannot be written to, a full disk: say what to do, not what SQLite said.
    throw new TransferError('The copy could not be saved there. Choose another place and try again.');
  }
  return { saved: true, path: target };
}

/** Asks for a file and says what is in it. Nothing changes until `applyImport`. */
export async function chooseImport(ctx: AppContext): Promise<ImportChoice> {
  ctx.session.pendingImport = null;
  const source = await ctx.files.chooseOpenPath();
  if (source === null) return { chosen: false };
  const fileName = basename(source);
  if (samePath(source, ctx.db.path)) {
    return { chosen: true, ok: false, fileName, reason: 'That is the file ParaLeet is already using.' };
  }
  const check = inspectDatabaseFile(source);
  if (!check.ok) return { chosen: true, ok: false, fileName, reason: check.reason };
  ctx.session.pendingImport = { path: source, summary: check.summary };
  return {
    chosen: true,
    ok: true,
    fileName,
    incoming: toDataSummary(check.summary),
    current: toDataSummary(summarizeDatabase(ctx.db)),
  };
}

/**
 * The user said yes: the chosen file is checked once more and copied next to the database, and
 * the app restarts. The swap itself happens at launch, before the database is opened, and the
 * database it replaces is kept as a backup.
 */
export function applyImport(ctx: AppContext): Done {
  const pending = ctx.session.pendingImport;
  if (pending === null) throw new TransferError('Choose a file to import first.');
  try {
    stageImport(pending.path, dataDirOf(ctx.db));
  } catch (error) {
    ctx.session.pendingImport = null;
    if (error instanceof TransferError) throw error;
    throw new TransferError('The file could not be copied. Your data was not changed. Try again.');
  }
  ctx.session.pendingImport = null;
  ctx.restart();
  return { ok: true };
}

export function cancelImport(ctx: AppContext): Done {
  ctx.session.pendingImport = null;
  return { ok: true };
}

export function showDataInFinder(ctx: AppContext): Done {
  ctx.files.reveal(ctx.db.path);
  return { ok: true };
}
