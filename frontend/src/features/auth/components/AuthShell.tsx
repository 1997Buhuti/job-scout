import type { ReactNode } from 'react';

import { AuthBrandPanel } from '@/features/auth/components/AuthBrandPanel';

type AuthShellProps = {
  highlights: string[];
  showTrustFooter?: boolean;
  children: ReactNode;
};

/**
 * Split-panel auth shell from Stitch Sign In / Sign Up screens.
 */
export function AuthShell({
  highlights,
  showTrustFooter,
  children,
}: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-8 sm:px-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-2xl lg:grid-cols-12">
        <AuthBrandPanel
          highlights={highlights}
          showTrustFooter={showTrustFooter}
        />
        <div className="flex flex-col justify-center border-outline-variant/20 p-10 lg:col-span-6 lg:border-l">
          {children}
        </div>
      </div>
    </main>
  );
}
