'use client';

import { useState } from 'react';

import { useUserProfile } from '@/features/profile/context/UserProfileContext';
import { updateSchedule, FREQUENCY_PRESETS } from '@/lib/api/scheduleService';

function formatNextRun(nextRunAt: string | undefined, schedulerEnabled: boolean): string {
  if (!schedulerEnabled || !nextRunAt) {
    return 'Not scheduled';
  }

  const date = new Date(nextRunAt);
  if (Number.isNaN(date.getTime())) {
    return 'Not scheduled';
  }

  return `Next run: ${date.toLocaleString()}`;
}

export function ScheduleSettingsCard() {
  const { profile, refresh } = useUserProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedulerEnabled = profile?.schedulerEnabled ?? false;
  const scheduleIntervalDays = profile?.scheduleIntervalDays ?? 7;

  const handleToggleEnabled = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await updateSchedule({ schedulerEnabled: !schedulerEnabled });
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectPreset = async (days: 1 | 7 | 30) => {
    setIsSaving(true);
    setError(null);
    try {
      await updateSchedule({ scheduleIntervalDays: days });
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-surface-container-low p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">
            schedule
          </span>
          <h2 className="text-lg font-medium text-on-surface">Scheduler</h2>
        </div>
        <span className="font-mono text-[11px] text-secondary">
          {schedulerEnabled ? 'Active' : 'Disabled'}
        </span>
      </div>

      <div className="space-y-6">
        {/* Enable / Disable toggle */}
        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            AUTOMATIC SCRAPE & MATCH
          </label>
          <button
            type="button"
            onClick={handleToggleEnabled}
            disabled={isSaving}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              schedulerEnabled
                ? 'border-secondary/50 bg-surface-container text-on-surface'
                : 'border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-bright'
            }`}
          >
            <span>{schedulerEnabled ? 'Scheduler Enabled' : 'Scheduler Disabled'}</span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${schedulerEnabled ? 'bg-secondary' : 'bg-outline-variant/40'}`}
            />
          </button>
        </div>

        {/* Frequency presets — Daily/Weekly/Monthly only, no custom day input */}
        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            RUN FREQUENCY
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {FREQUENCY_PRESETS.map(({ label, days }) => (
              <button
                key={days}
                type="button"
                onClick={() => handleSelectPreset(days)}
                disabled={isSaving}
                className={`rounded-lg py-2.5 px-3 text-xs font-medium transition-all disabled:opacity-60 ${
                  scheduleIntervalDays === days
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'border border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-bright'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-[11px] text-outline">
            {formatNextRun(profile?.nextRunAt, schedulerEnabled)}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </div>
        )}

        {/* No-repeat-suggestions guarantee copy (FR-4/FR-5) */}
        <p className="text-xs text-outline-variant">
          Jobs we&apos;ve already suggested to you are never re-sent — each scheduled run only
          evaluates and emails new job postings you haven&apos;t seen before.
        </p>
      </div>
    </div>
  );
}
