'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  getLoggedInUserDetail,
  type UserDetail,
  type UserProfileData,
} from '@/lib/api/profileService';

type UserProfileContextValue = {
  user: UserDetail | null;
  profile: UserProfileData | null;
  isLoading: boolean;
  error: string | null;
  /** Load once if empty; pass `true` to force a network refresh. */
  refresh: (force?: boolean) => Promise<void>;
  /** Optimistically replace cached user/profile (e.g. after PUT). */
  setUser: (user: UserDetail | null) => void;
  /** Clear cache on sign-out. */
  clear: () => void;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const refresh = useCallback(async (force = false) => {
    // Skip network if we already loaded this session (unless forced).
    if (!force && hasFetched) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const detail = await getLoggedInUserDetail();
      setUser(detail);
      setHasFetched(true);
    } catch (err) {
      console.error('[UserProfile] failed to load:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
      setUser(null);
      setHasFetched(true);
    } finally {
      setIsLoading(false);
    }
  }, [hasFetched]);

  const clear = useCallback(() => {
    setUser(null);
    setError(null);
    setHasFetched(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    // Initial load only — later callers use refresh(true) or clear().
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const value = useMemo<UserProfileContextValue>(
    () => ({
      user,
      profile: user?.profile ?? null,
      isLoading,
      error,
      refresh,
      setUser,
      clear,
    }),
    [user, isLoading, error, refresh, clear],
  );

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error('useUserProfile must be used within UserProfileProvider');
  }
  return ctx;
}
