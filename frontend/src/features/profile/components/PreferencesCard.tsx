'use client';

import { useState } from 'react';

type FrequencyOption = 'realtime' | 'daily' | 'weekly';

export function PreferencesCard() {
  const [salary, setSalary] = useState<number>(450000);
  const [workModes, setWorkModes] = useState({
    remote: true,
    hybrid: true,
    onsite: false,
  });
  const [frequency, setFrequency] = useState<FrequencyOption>('realtime');

  const toggleWorkMode = (key: keyof typeof workModes) => {
    setWorkModes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const formatCurrency = (val: number) => {
    return `LKR ${val.toLocaleString()} / mo`;
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
              {formatCurrency(salary)}
            </span>
          </div>

          <input
            type="range"
            min={250000}
            max={800000}
            step={25000}
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
            className="h-2 w-full cursor-pointer rounded-lg bg-surface-container accent-[#4edea3]"
          />

          <div className="mt-1 flex justify-between font-mono text-[11px] text-outline">
            <span>LKR 250k</span>
            <span>LKR 500k</span>
            <span>LKR 800k+</span>
          </div>
        </div>

        {/* Work Mode Checkboxes */}
        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            WORK MODE PREFERENCES
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label
              className={`flex items-center gap-2 rounded-lg p-3 border transition-colors cursor-pointer ${
                workModes.remote
                  ? 'border-secondary/50 bg-surface-container hover:bg-surface-bright'
                  : 'border-outline-variant/30 bg-surface-container hover:bg-surface-bright'
              }`}
            >
              <input
                type="checkbox"
                checked={workModes.remote}
                onChange={() => toggleWorkMode('remote')}
                className="h-4 w-4 rounded accent-[#4edea3]"
              />
              <span className="text-sm font-medium text-on-surface">Remote</span>
            </label>

            <label
              className={`flex items-center gap-2 rounded-lg p-3 border transition-colors cursor-pointer ${
                workModes.hybrid
                  ? 'border-secondary/50 bg-surface-container hover:bg-surface-bright'
                  : 'border-outline-variant/30 bg-surface-container hover:bg-surface-bright'
              }`}
            >
              <input
                type="checkbox"
                checked={workModes.hybrid}
                onChange={() => toggleWorkMode('hybrid')}
                className="h-4 w-4 rounded accent-[#4edea3]"
              />
              <span className="text-sm font-medium text-on-surface">Hybrid</span>
            </label>

            <label
              className={`flex items-center gap-2 rounded-lg p-3 border transition-colors cursor-pointer ${
                workModes.onsite
                  ? 'border-secondary/50 bg-surface-container hover:bg-surface-bright'
                  : 'border-outline-variant/30 bg-surface-container hover:bg-surface-bright'
              }`}
            >
              <input
                type="checkbox"
                checked={workModes.onsite}
                onChange={() => toggleWorkMode('onsite')}
                className="h-4 w-4 rounded accent-[#4edea3]"
              />
              <span className="text-sm font-medium text-on-surface">Colombo Onsite</span>
            </label>
          </div>
        </div>

        {/* Digest & Scrape Frequency Preset */}
        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            DIGEST & SCRAPE FREQUENCY
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setFrequency('realtime')}
              className={`rounded-lg py-2.5 px-3 text-xs font-medium transition-all ${
                frequency === 'realtime'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'border border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-bright'
              }`}
            >
              Real-time (Webhook)
            </button>

            <button
              type="button"
              onClick={() => setFrequency('daily')}
              className={`rounded-lg py-2.5 px-3 text-xs font-medium transition-all ${
                frequency === 'daily'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'border border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-bright'
              }`}
            >
              Daily Digest
            </button>

            <button
              type="button"
              onClick={() => setFrequency('weekly')}
              className={`rounded-lg py-2.5 px-3 text-xs font-medium transition-all ${
                frequency === 'weekly'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'border border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-bright'
              }`}
            >
              Weekly Batch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
