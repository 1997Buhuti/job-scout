'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCurrentUser } from 'aws-amplify/auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        await getCurrentUser();
        if (isMounted) {
          setIsAuthenticated(true);
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false);
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router, pathname]);

  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-secondary border-t-transparent shadow-[0_0_15px_rgba(78,222,163,0.3)]" />
          <span className="font-mono text-xs text-on-surface-variant">Verifying authentication...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
