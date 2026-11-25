import { useCallback, useEffect, useRef, useState } from 'react';
import type { TodayView } from '../../../bridge/contract';
import type { Settings, SettingsPatch } from '../../../core/settings';
import type { AccessoryId } from '../../../core/types';
import { api } from '../../bridge';
import { useToast } from '../../components/Toast';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

/** The row an error belongs to: a setting's key, or "accessories". */
export type RowKey = keyof Settings | 'accessories';

interface Overlay {
  settings?: SettingsPatch;
  equipped?: AccessoryId[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Everything the settings screen needs: the saved values, and the one way to change them.
 *
 * Changes run one after another, so the last choice always wins and saves never arrive out of
 * order. While changes are in flight the controls show the newest choice; when the queue is empty
 * they show what was saved, so a failed save puts the control back.
 */
export function useSettingsModel() {
  const settingsQuery = useBridgeQuery(() => api().getSettings());
  const todayQuery = useBridgeQuery(() => api().getToday());
  const [savedSettings, setSavedSettings] = useState<Settings>();
  const [savedPet, setSavedPet] = useState<TodayView['pet']>();
  const [overlay, setOverlay] = useState<Overlay>({});
  const [errors, setErrors] = useState<Partial<Record<RowKey, string>>>({});
  const { message: toastMessage, show: showToast } = useToast();
  const inFlight = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());

  // Values changed elsewhere flow in, except while our own saves are running: those end with a reload.
  useEffect(() => {
    if (settingsQuery.data && inFlight.current === 0) setSavedSettings(settingsQuery.data);
  }, [settingsQuery.data]);
  useEffect(() => {
    if (todayQuery.data && inFlight.current === 0) setSavedPet(todayQuery.data.pet);
  }, [todayQuery.data]);

  const { reload: reloadSettings } = settingsQuery;
  const { reload: reloadToday } = todayQuery;

  const setError = useCallback(
    (key: RowKey, message: string) => setErrors((previous) => ({ ...previous, [key]: message })),
    [],
  );
  const clearError = useCallback(
    (key: RowKey) =>
      setErrors((previous) => {
        if (previous[key] === undefined) return previous;
        const { [key]: _removed, ...rest } = previous;
        return rest;
      }),
    [],
  );

  const run = useCallback(
    (key: RowKey, shown: Overlay, task: () => Promise<void>): Promise<boolean> => {
      inFlight.current += 1;
      setOverlay((previous) => ({
        ...previous,
        ...shown,
        settings: { ...previous.settings, ...shown.settings },
      }));
      const result = chain.current.then(async () => {
        try {
          await task();
          clearError(key);
          showToast('Saved');
          return true;
        } catch (error) {
          setError(key, messageOf(error));
          return false;
        } finally {
          inFlight.current -= 1;
          if (inFlight.current === 0) {
            setOverlay({});
            reloadSettings();
            reloadToday();
          }
        }
      });
      chain.current = result.then(() => undefined);
      return result;
    },
    [clearError, setError, showToast, reloadSettings, reloadToday],
  );

  const save = useCallback(
    (key: keyof Settings, patch: SettingsPatch) =>
      run(key, { settings: patch }, async () => {
        setSavedSettings(await api().updateSettings(patch));
      }),
    [run],
  );

  const setEquipped = useCallback(
    (accessories: AccessoryId[]) =>
      run('accessories', { equipped: accessories }, async () => {
        setSavedPet((await api().setEquippedAccessories({ accessories })).pet);
      }),
    [run],
  );

  const settings = savedSettings ? { ...savedSettings, ...overlay.settings } : undefined;
  return {
    settings,
    unlocked: savedPet?.unlockedAccessories ?? [],
    equipped: overlay.equipped ?? savedPet?.equippedAccessories ?? [],
    loaded: settings !== undefined && savedPet !== undefined,
    loadError: settingsQuery.error ?? todayQuery.error,
    errors,
    setError,
    clearError,
    save,
    setEquipped,
    toastMessage,
  };
}
