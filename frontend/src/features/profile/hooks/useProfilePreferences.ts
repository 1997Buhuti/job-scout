'use client';

import { useCallback, useMemo, useState } from 'react';

import type {
  ProfilePreferences,
  UserProfileData,
} from '@/features/profile/types/userProfile';
import { toPreferences } from '@/features/profile/utils/preferences';

/**
 * Preference values shown in the profile cards.
 *
 * Until the user edits, the values come from the saved profile. After an edit,
 * the draft is the source of truth. A successful save replaces the draft with
 * the backend's response. Unrelated profile refreshes (for example, toggling the
 * scheduler) leave unsaved edits in place.
 */
export function useProfilePreferences(profile: UserProfileData | null) {
  const [draft, setDraft] = useState<ProfilePreferences | null>(null);

  const values = useMemo<ProfilePreferences | null>(
    () => draft ?? (profile ? toPreferences(profile) : null),
    [draft, profile],
  );

  const update = useCallback(
    (patch: Partial<ProfilePreferences>) => {
      setDraft((current) => {
        const base = current ?? (profile ? toPreferences(profile) : null);
        return base ? { ...base, ...patch } : current;
      });
    },
    [profile],
  );

  const commit = useCallback((saved: ProfilePreferences) => {
    setDraft(saved);
  }, []);

  return { values, isReady: values !== null, update, commit };
}
