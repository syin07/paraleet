import { timeOfDaySchema } from '../../../core/settings';
import { Select } from '../../components/Field';
import { QueryNotice } from '../../components/Layout';
import { Toast } from '../../components/Toast';
import { Toggle } from '../../components/Toggle';
import { DataGroup } from './DataGroup';
import { LearningPlansGroup } from './LearningPlansGroup';
import { AccessoryChips, DraftInput, Group, Row, Segmented, sameValue, type SegmentOption } from './SettingsParts';
import { useSettingsModel, type RowKey } from './useSettingsModel';

const TIME_MESSAGE = 'Use a 24-hour time like 16:00';
const HANDLE_MAX = 64;

/** The day can start at any whole hour from midnight to 08:00. */
const BOUNDARY_HOURS = Array.from({ length: 9 }, (_, hour) => hour);
const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

const RETENTION_CHOICES = [0.8, 0.85, 0.9, 0.95];
const percent = (value: number): string => `${Math.round(value * 1000) / 10}%`;

/** The four clear choices, plus the saved value if it is none of them, so the screen never misstates it. */
function retentionOptions(saved: number): SegmentOption[] {
  const known = RETENTION_CHOICES.some((choice) => sameValue(choice, saved));
  const values = known ? RETENTION_CHOICES : [...RETENTION_CHOICES, saved].sort((a, b) => a - b);
  return values.map((value) => ({ value, label: percent(value) }));
}

export function SettingsScreen() {
  const model = useSettingsModel();
  const { settings, errors, save } = model;

  if (!settings || !model.loaded) {
    return (
      <div className="mx-0 max-w-[640px] px-6 pt-2 pb-10 min-[960px]:px-10">
        <h1 className="mb-6 flex min-h-8 items-center text-xl font-semibold text-fg">Settings</h1>
        <QueryNotice loading={model.loadError === null} error={model.loadError} />
      </div>
    );
  }

  const timeRow = (key: 'firstReminderTime' | 'eveningReminderTime', label: string, description: string) => (
    <Row label={label} description={description} error={errors[key]}>
      <div className="w-24 shrink-0">
      <DraftInput
        label={label}
        value={settings[key]}
        placeholder="HH:MM"
        maxLength={5}
        inputMode="numeric"
        className="text-center tabular-nums"
        invalid={errors[key] !== undefined}
        onEdit={() => model.clearError(key)}
        onCommit={async (text) => {
          const time = text.trim();
          if (!timeOfDaySchema.safeParse(time).success) {
            model.setError(key, TIME_MESSAGE);
            return false;
          }
          if (time === settings[key]) return true;
          return save(key, { [key]: time });
        }}
      />
      </div>
    </Row>
  );

  const rowError = (key: RowKey) => errors[key];

  return (
    <div className="mx-0 max-w-[640px] px-6 pt-2 pb-10 min-[960px]:px-10">
      <header className="mb-6 flex min-h-8 items-center">
        <h1 className="text-xl font-semibold text-fg">Settings</h1>
      </header>

      <Group title="Reminders" note="At most two a day. Skipped once Para is fed.">
        {timeRow('firstReminderTime', 'First reminder', 'Para starts asking once this time has passed.')}
        {timeRow('eveningReminderTime', 'Evening reminder', 'A second nudge if Para is still hungry.')}
        <Row
          label="Day starts at"
          description="A solve before this hour counts for the previous day."
          error={rowError('dayBoundaryHour')}
        >
          <Select
            aria-label="Day starts at"
            className="w-24"
            value={settings.dayBoundaryHour}
            onChange={(event) => void save('dayBoundaryHour', { dayBoundaryHour: Number(event.target.value) })}
          >
            {(BOUNDARY_HOURS.includes(settings.dayBoundaryHour)
              ? BOUNDARY_HOURS
              : [...BOUNDARY_HOURS, settings.dayBoundaryHour]
            ).map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </Select>
        </Row>
      </Group>

      <Group title="Review schedule">
        <Row
          label="Target retention"
          description="How sure Para wants you to be when a review comes up. Higher means more frequent reviews."
          error={rowError('targetRetention')}
        >
          <Segmented
            label="Target retention"
            options={retentionOptions(settings.targetRetention)}
            value={settings.targetRetention}
            onChange={(value) => void save('targetRetention', { targetRetention: value })}
          />
        </Row>
      </Group>

      <Group title="Para">
        <Row label="Show Para on the desktop" error={rowError('petVisible')}>
          <Toggle
            label="Show Para on the desktop"
            checked={settings.petVisible}
            onChange={(checked) => void save('petVisible', { petVisible: checked })}
          />
        </Row>
        <Row
          label="Launch at login"
          description="Para and the menu bar icon start with your Mac."
          error={rowError('launchAtLogin')}
        >
          <Toggle
            label="Launch at login"
            checked={settings.launchAtLogin}
            onChange={(checked) => void save('launchAtLogin', { launchAtLogin: checked })}
          />
        </Row>
        <Row label="Accessories" error={rowError('accessories')} stacked>
          <AccessoryChips unlocked={model.unlocked} equipped={model.equipped} onChange={(next) => void model.setEquipped(next)} />
        </Row>
      </Group>

      <LearningPlansGroup
        model={settings.planModel}
        saveModel={(planModel) => save('planModel', { planModel })}
        modelError={rowError('planModel')}
        clearError={model.clearError}
      />

      <Group title="Account handles">
        <Row
          label="LeetCode handle"
          description="Not used yet. Saved for checking solves automatically in a later version."
          error={rowError('leetcodeHandle')}
        >
          <div className="w-[200px] shrink-0">
          <DraftInput
            label="LeetCode handle"
            value={settings.leetcodeHandle}
            maxLength={HANDLE_MAX}
            invalid={rowError('leetcodeHandle') !== undefined}
            onEdit={() => model.clearError('leetcodeHandle')}
            onCommit={async (text) => {
              const handle = text.trim().slice(0, HANDLE_MAX);
              if (handle === settings.leetcodeHandle) return true;
              return save('leetcodeHandle', { leetcodeHandle: handle });
            }}
          />
          </div>
        </Row>
      </Group>

      <DataGroup />

      <Toast message={model.toastMessage} />
    </div>
  );
}
