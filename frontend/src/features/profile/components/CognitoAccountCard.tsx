'use client';

import { useState } from 'react';

import { useUserProfile } from '@/features/profile/context/UserProfileContext';

export function CognitoAccountCard() {
  const { user, isLoading } = useUserProfile();
  const [copied, setCopied] = useState(false);

  const email = user?.email ?? '';
  const subId = user?.sub ?? '';

  const handleCopySubId = () => {
    if (subId) {
      navigator.clipboard.writeText(subId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-xl bg-surface-container-low p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">
            lock
          </span>
          <h2 className="text-lg font-medium text-on-surface">
            Cognito Auth & Account Details
          </h2>
        </div>
        <span className="rounded bg-secondary/10 px-2 py-0.5 font-mono text-[11px] text-secondary">
          {isLoading && !user ? 'Checking Session...' : 'Verified Session'}
        </span>
      </div>

      {/* Grid Fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            ACCOUNT EMAIL
          </label>
          <div className="relative">
            <input
              type="email"
              value={email}
              readOnly
              placeholder="user@example.com"
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-sm text-on-surface outline-none transition-colors"
            />
            <span className="material-symbols-outlined absolute right-3 top-3 text-[18px] text-secondary">
              verified_user
            </span>
          </div>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            COGNITO SUB ID
          </label>
          <div className="flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5">
            <span className="truncate font-mono text-xs text-outline-variant">
              {isLoading && !user ? 'Fetching SUB ID...' : subId || 'No SUB ID'}
            </span>
            {subId ? (
              <button
                type="button"
                onClick={handleCopySubId}
                className="ml-2 text-xs text-outline hover:text-secondary transition-colors shrink-0"
                title="Copy Cognito SUB ID"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bottom Refresh Status */}
      <div className="mt-4 flex items-center justify-between text-xs text-outline">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          <span>Loaded once from Cognito & GET /me/profile (shared app state)</span>
        </div>
      </div>
    </div>
  );
}
