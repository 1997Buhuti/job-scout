'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from 'aws-amplify/auth';

interface AuthRedirectProps {
  children: ReactNode;
}

/**
 * Redirects authenticated users away from auth pages (login/signup).
 * Shows a loading state while checking auth status.
 */
export function AuthRedirect({ children }: AuthRedirectProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        await getCurrentUser();
        if (isMounted) {
          setStatus('authenticated');
          router.replace('/');
        }
      } catch {
        if (isMounted) {
          setStatus('unauthenticated');
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Show loading while checking auth to prevent flash of login form
  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-secondary border-t-transparent shadow-[0_0_15px_rgba(78,222,163,0.3)]" />
          <span className="font-mono text-xs text-on-surface-variant">Checking session...</span>
        </div>
      </div>
    );
  }

  // Don't render children if authenticated (redirect in progress)
  if (status === 'authenticated') {
    return null;
  }

  return <>{children}</>;
}
