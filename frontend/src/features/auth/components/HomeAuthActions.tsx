'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCurrentUser, signOut } from 'aws-amplify/auth';

import { useUserProfile } from '@/features/profile/context/UserProfileContext';

/**
 * Home CTAs: Sign In / Sign Up, or Sign Out when a Cognito session exists.
 */
export function HomeAuthActions() {
  const { clear } = useUserProfile();
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then(() => {
        if (!cancelled) {
          setSignedIn(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSignedIn(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSignOut() {
    setPending(true);
    try {
      await signOut();
      clear();
      setSignedIn(false);
    } finally {
      setPending(false);
    }
  }

  if (!ready) {
    return (
      <div className="mt-8 h-10 w-48 animate-pulse rounded-lg bg-surface-container" />
    );
  }

  if (signedIn) {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onSignOut}
          disabled={pending}
          className="rounded-lg border border-outline-variant/40 px-5 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-60"
        >
          {pending ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <Link
        href="/login"
        className="rounded-lg bg-secondary px-5 py-2.5 text-sm font-medium text-on-secondary shadow-[0_0_20px_rgba(78,222,163,0.25)] hover:bg-secondary-fixed"
      >
        Sign In
      </Link>
      <Link
        href="/signup"
        className="rounded-lg border border-outline-variant/40 px-5 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-high"
      >
        Sign Up
      </Link>
    </div>
  );
}
