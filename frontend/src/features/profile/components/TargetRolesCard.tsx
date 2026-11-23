'use client';

import { useState } from 'react';

import {
  addExcludedKeyword,
  addTargetRole,
  PREFERENCE_LIMITS,
} from '@/features/profile/utils/preferences';

interface TargetRolesCardProps {
  targetRoles: string[];
  excludedKeywords: string[];
  disabled?: boolean;
  onTargetRolesChange: (roles: string[]) => void;
  onExcludedKeywordsChange: (keywords: string[]) => void;
}

export function TargetRolesCard({
  targetRoles,
  excludedKeywords,
  disabled = false,
  onTargetRolesChange,
  onExcludedKeywordsChange,
}: TargetRolesCardProps) {
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');
  const [roleError, setRoleError] = useState<string | null>(null);

  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [keywordError, setKeywordError] = useState<string | null>(null);

  const handleAddRole = () => {
    const result = addTargetRole(targetRoles, newRoleInput);
    if (result.error) {
      setRoleError(result.error);
      return;
    }
    onTargetRolesChange(result.items);
    setNewRoleInput('');
    setRoleError(null);
    setIsAddingRole(false);
  };

  const handleRemoveRole = (role: string) => {
    onTargetRolesChange(targetRoles.filter((r) => r !== role));
  };

  const handleAddKeyword = () => {
    const result = addExcludedKeyword(excludedKeywords, newKeywordInput);
    if (result.error) {
      setKeywordError(result.error);
      return;
    }
    onExcludedKeywordsChange(result.items);
    setNewKeywordInput('');
    setKeywordError(null);
    setIsAddingKeyword(false);
  };

  const handleRemoveKeyword = (keyword: string) => {
    onExcludedKeywordsChange(excludedKeywords.filter((k) => k !== keyword));
  };

  return (
    <div className="rounded-xl bg-surface-container-low p-6">
      {/* Card Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">
            target
          </span>
          <h2 className="text-lg font-medium text-on-surface">Target Roles & Focus</h2>
        </div>
        <span className="font-mono text-[11px] text-outline">
          AI Matching Vector
        </span>
      </div>

      <div className="space-y-4">
        {/* Primary Target Roles */}
        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            PRIMARY TARGET ROLES
          </label>
          <div className="flex flex-wrap gap-2">
            {targetRoles.map((role) => (
              <span
                key={role}
                className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-on-secondary shadow-sm"
              >
                {role}
                <button
                  type="button"
                  onClick={() => handleRemoveRole(role)}
                  disabled={disabled}
                  className="hover:opacity-75 disabled:opacity-50"
                  title="Remove role"
                  aria-label={`Remove role ${role}`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </span>
            ))}

            {isAddingRole ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newRoleInput}
                  onChange={(e) => {
                    setNewRoleInput(e.target.value);
                    setRoleError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                  placeholder="Role title..."
                  maxLength={PREFERENCE_LIMITS.maxRoleLength}
                  autoFocus
                  className="rounded-lg border border-secondary bg-surface-container px-3 py-1.5 text-xs text-on-surface outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddRole}
                  disabled={disabled}
                  className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-on-secondary disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingRole(true)}
                disabled={disabled}
                className="flex items-center gap-1 rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-on-surface hover:bg-surface-bright transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[14px]">
                  add
                </span>
                Add Role
              </button>
            )}
          </div>
          {roleError && (
            <p role="alert" className="mt-2 text-xs text-error">
              {roleError}
            </p>
          )}
        </div>

        {/* Excluded Keywords */}
        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wider text-outline uppercase">
            EXCLUDED KEYWORDS
          </label>
          <div className="flex flex-wrap gap-2">
            {excludedKeywords.map((keyword) => (
              <span
                key={keyword}
                className="flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-1 text-xs text-outline"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(keyword)}
                  disabled={disabled}
                  className="hover:text-on-surface disabled:opacity-50"
                  title="Remove keyword"
                  aria-label={`Remove keyword ${keyword}`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </span>
            ))}

            {isAddingKeyword ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newKeywordInput}
                  onChange={(e) => {
                    setNewKeywordInput(e.target.value);
                    setKeywordError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                  placeholder="Exclude keyword..."
                  maxLength={PREFERENCE_LIMITS.maxExcludedKeywordLength}
                  autoFocus
                  className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1 text-xs text-on-surface outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  disabled={disabled}
                  className="rounded-lg bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingKeyword(true)}
                disabled={disabled}
                className="flex items-center gap-1 rounded-lg border border-dashed border-outline-variant/40 px-3 py-1 text-xs text-outline hover:border-outline hover:text-on-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[14px]">
                  add
                </span>
                Exclude Keyword
              </button>
            )}
          </div>
          {keywordError && (
            <p role="alert" className="mt-2 text-xs text-error">
              {keywordError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
