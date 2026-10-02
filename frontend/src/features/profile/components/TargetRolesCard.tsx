'use client';

import { useState } from 'react';

export function TargetRolesCard() {
  const [targetRoles, setTargetRoles] = useState<string[]>([
    'Fullstack Engineer',
    'Cloud / DevOps Engineer',
    'Backend Developer',
  ]);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');

  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([
    'PHP',
    'Legacy .NET',
    'Junior',
  ]);
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [newKeywordInput, setNewKeywordInput] = useState('');

  const handleAddRole = () => {
    if (newRoleInput.trim()) {
      setTargetRoles([...targetRoles, newRoleInput.trim()]);
      setNewRoleInput('');
      setIsAddingRole(false);
    }
  };

  const handleRemoveRole = (role: string) => {
    setTargetRoles(targetRoles.filter((r) => r !== role));
  };

  const handleAddKeyword = () => {
    if (newKeywordInput.trim()) {
      setExcludedKeywords([...excludedKeywords, newKeywordInput.trim()]);
      setNewKeywordInput('');
      setIsAddingKeyword(false);
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setExcludedKeywords(excludedKeywords.filter((k) => k !== keyword));
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
                  className="hover:opacity-75"
                  title="Remove role"
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
                  onChange={(e) => setNewRoleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                  placeholder="Role title..."
                  autoFocus
                  className="rounded-lg border border-secondary bg-surface-container px-3 py-1.5 text-xs text-on-surface outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddRole}
                  className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-on-secondary"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingRole(true)}
                className="flex items-center gap-1 rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-on-surface hover:bg-surface-bright transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">
                  add
                </span>
                Add Role
              </button>
            )}
          </div>
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
                  className="hover:text-on-surface"
                  title="Remove keyword"
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
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                  placeholder="Exclude keyword..."
                  autoFocus
                  className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1 text-xs text-on-surface outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="rounded-lg bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingKeyword(true)}
                className="flex items-center gap-1 rounded-lg border border-dashed border-outline-variant/40 px-3 py-1 text-xs text-outline hover:border-outline hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">
                  add
                </span>
                Exclude Keyword
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
