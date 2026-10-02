'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';

import { useUserProfile } from '@/features/profile/context/UserProfileContext';

interface ProfileOverlayCardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileOverlayCard({ isOpen, onClose }: ProfileOverlayCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const { user, isLoading, clear } = useUserProfile();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      clear();
      onClose();
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!isOpen) return null;

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'JS';

  return (
    <div
      ref={cardRef}
      className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-outline-variant/20 bg-surface-container-low/95 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Header Profile Info */}
      <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/15">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-secondary/30 via-secondary/10 to-transparent border border-secondary/40 text-secondary font-bold text-sm shadow-[0_0_12px_rgba(78,222,163,0.15)]">
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          {isLoading && !user ? (
            <div className="space-y-1.5">
              <div className="h-4 w-28 animate-pulse rounded bg-surface-container-high" />
              <div className="h-3 w-36 animate-pulse rounded bg-surface-container-high" />
            </div>
          ) : (
            <>
              <h3 className="truncate text-sm font-semibold tracking-tight text-on-surface">
                {user?.name || 'User'}
              </h3>
              {user?.email && (
                <p className="truncate text-xs text-on-surface-variant font-mono">
                  {user.email}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-error/30 bg-error/5 py-2.5 text-xs font-medium text-error hover:bg-error/15 hover:border-error/50 transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
