import type {
  ProfilePreferences,
  UserProfileData,
  WorkMode,
} from '@/features/profile/types/userProfile';

/**
 * Limits enforced by backend/src/modules/profileModule/updateProfile/updateProfile.ts.
 * The UI applies the same limits so a save is not rejected by the API.
 */
export const PREFERENCE_LIMITS = {
  maxTargetRoles: 10,
  maxRoleLength: 80,
  maxExcludedKeywords: 20,
  maxExcludedKeywordLength: 40,
} as const;

export const SALARY_SLIDER = {
  min: 250_000,
  max: 800_000,
  step: 25_000,
  default: 450_000,
} as const;

/** Display order for work modes. Saved arrays follow this order. */
export const WORK_MODE_ORDER: readonly WorkMode[] = ['remote', 'hybrid', 'onsite'];

export interface ListEditResult {
  items: string[];
  error: string | null;
}

export function addTargetRole(roles: string[], input: string): ListEditResult {
  const role = input.trim();
  if (role === '') {
    return { items: roles, error: 'Enter a role title.' };
  }
  if (role.length > PREFERENCE_LIMITS.maxRoleLength) {
    return {
      items: roles,
      error: `Roles must be ${PREFERENCE_LIMITS.maxRoleLength} characters or fewer.`,
    };
  }
  if (roles.some((existing) => existing.toLowerCase() === role.toLowerCase())) {
    return { items: roles, error: `"${role}" is already in the list.` };
  }
  if (roles.length >= PREFERENCE_LIMITS.maxTargetRoles) {
    return {
      items: roles,
      error: `You can add up to ${PREFERENCE_LIMITS.maxTargetRoles} roles.`,
    };
  }
  return { items: [...roles, role], error: null };
}

/** Keywords are trimmed and lowercased, the same way the backend stores them. */
export function addExcludedKeyword(keywords: string[], input: string): ListEditResult {
  const keyword = input.trim().toLowerCase();
  if (keyword === '') {
    return { items: keywords, error: 'Enter a keyword.' };
  }
  if (keyword.length > PREFERENCE_LIMITS.maxExcludedKeywordLength) {
    return {
      items: keywords,
      error: `Keywords must be ${PREFERENCE_LIMITS.maxExcludedKeywordLength} characters or fewer.`,
    };
  }
  if (keywords.includes(keyword)) {
    return { items: keywords, error: `"${keyword}" is already excluded.` };
  }
  if (keywords.length >= PREFERENCE_LIMITS.maxExcludedKeywords) {
    return {
      items: keywords,
      error: `You can exclude up to ${PREFERENCE_LIMITS.maxExcludedKeywords} keywords.`,
    };
  }
  return { items: [...keywords, keyword], error: null };
}

/** The backend rejects an empty work mode list, so the last mode cannot be cleared. */
export function toggleWorkMode(
  modes: WorkMode[],
  mode: WorkMode,
): { modes: WorkMode[]; error: string | null } {
  const next = modes.includes(mode)
    ? modes.filter((m) => m !== mode)
    : [...modes, mode];

  if (next.length === 0) {
    return { modes, error: 'Keep at least one work mode selected.' };
  }
  return {
    modes: WORK_MODE_ORDER.filter((m) => next.includes(m)),
    error: null,
  };
}

export function toPreferences(profile: UserProfileData): ProfilePreferences {
  return {
    targetRoles: profile.targetRoles ?? [],
    excludedKeywords: profile.excludedKeywords ?? [],
    workModes: profile.workModes ?? [],
    minMonthlySalaryLkr: profile.minMonthlySalaryLkr ?? null,
  };
}
