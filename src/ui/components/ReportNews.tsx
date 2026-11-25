import { useCallback } from 'react';
import type { ReportResult } from '../../bridge/contract';
import { ACCESSORIES } from '../../core/types';
import { Toast, useToast } from './Toast';

/** What a report changed that is worth saying out loud: Para grew, or an accessory was unlocked. */
export function reportNews(result: ReportResult): string | null {
  const news: string[] = [];
  if (result.growth.stage !== result.growth.previousStage) {
    news.push(`Para grew into ${result.growth.stage === 'adult' ? 'an adult' : `a ${result.growth.stage}`}!`);
  }
  if (result.unlocked.length > 0) {
    const names = result.unlocked.map((id) => ACCESSORIES[id].label).join(' and ');
    news.push(`New for Para: ${names}. Put ${result.unlocked.length > 1 ? 'them' : 'it'} on in Settings.`);
  }
  return news.length > 0 ? news.join(' ') : null;
}

/**
 * For any screen that opens the report form: pass `celebrate` as the dialog's `onReported` and
 * render `news` once. The toast outlives the dialog.
 */
export function useReportNews(): { celebrate: (result: ReportResult) => void; news: React.ReactNode } {
  const toast = useToast(4000);
  const { show } = toast;
  const celebrate = useCallback(
    (result: ReportResult) => {
      const text = reportNews(result);
      if (text !== null) show(text);
    },
    [show],
  );
  return { celebrate, news: <Toast message={toast.message} /> };
}
