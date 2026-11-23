'use client';

import { useState } from 'react';

import type { WorkMode } from '@/features/profile/types/userProfile';
import {
  SALARY_SLIDER,
  toggleWorkMode,
  WORK_MODE_ORDER,
} from '@/features/profile/utils/preferences';

interface PreferencesCardProps {
  minMonthlySalaryLkr: number | null;
  workModes: WorkMode[];
  disabled?: boolean;
  onMinMonthlySalaryChange: (value: number | null) => void;
  onWorkModesChange: (modes: WorkMode[]) => void;
}

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'Colombo Onsite',
};

const formatCurrency = (val: number) => `LKR ${val.toLocaleString()} / mo`;

export function PreferencesCard({
  minMonthlySalaryLkr,
  workModes,
  disabled = false,
  onMinMonthlySalaryChange,
  onWorkModesChange,
}: PreferencesCardProps) {
  const [workModeError, setWorkModeError] = useState<string | null>(null);

  const hasMinimum = minMonthlySalaryLkr !== null;
  const sliderValue = minMonthlySalaryLkr ?? SALARY_SLIDER.default;

  const handleToggleWorkMode = (mode: WorkMode) => {
    const result = toggleWorkMode(workModes, mode);
    if (result.error) {
      setWorkModeError(result.error);
      return;
    }
    setWorkModeError(null);
    onWorkModesChange(result.modes);
  };

  return (
    <div className="rounded-xl bg-surface-container-low p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">
            tune
          </span>
          <h2 className="text-lg font-medium text-on-surface">Preferences & Guardrails</h2>
        </div>
        <span className="font-mono text-[11px] text-secondary">
          Active Filter
        </span>
      </div>

      <div className="space-y-6">
        {/* Minimum Salary Range Slider */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
              MINIMUM MONTHLY SALARY EXPECTATION
            </label>
            <span className="font-mono text-sm font-semibold text-secondary">
              {hasMinimum ? formatCurrency(sliderValue) : 'Not set'}
            </span>
          </div>
          <input
            type="range"
            min={SALARY_SLIDER.min}
            max={SALARY_SLIDER.max}
            step={SALARY_SLIDER.step}
            value={sliderValue}
            disabled={disabled || !hasMinimum}
            onChange={(e) => onMinMonthlySalaryChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer rounded-lg bg-surface-container accent-[#4edea3] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-outline">
            <span>LKR 250k</span>
            <span>LKR 500k</span>
            <span>LKR 800k+</span>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-on-surface">
            <input
              type="checkbox"
              checked={!hasMinimum}
              disabled={disabled}
              onChange={(e) =>
                onMinMonthlySalaryChange(e.target.checked ? null : SALARY_SLIDER.default)
              }
              className="h-4 w-4 rounded accent-[#4edea3]"
            />
            No minimum
          </label>
        </div>

        {/* Work Mode Checkboxes */}
        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            WORK MODE PREFERENCES
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {WORK_MODE_ORDER.map((mode) => {
              const checked = workModes.includes(mode);
              return (
                <label
                  key={mode}
                  className={`flex items-center gap-2 rounded-lg p-3 border transition-colors cursor-pointer ${
                    checked
                      ? 'border-secondary/50 bg-surface-container hover:bg-surface-bright'
                      : 'border-outline-variant/30 bg-surface-container hover:bg-surface-bright'
                  } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => handleToggleWorkMode(mode)}
                    className="h-4 w-4 rounded accent-[#4edea3]"
                  />
                  <span className="text-sm font-medium text-on-surface">
                    {WORK_MODE_LABELS[mode]}
                  </span>
                </label>
              );
            })}
          </div>
          {workModeError && (
            <p role="alert" className="mt-2 text-xs text-error">
              {workModeError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
