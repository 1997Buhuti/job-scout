import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuthShell } from '@/features/auth/components/AuthShell';
import { SignUpForm } from '@/features/auth/components/SignUpForm';

export const metadata: Metadata = {
  title: 'Sign Up — Job Scout',
  description: 'Create a Job Scout account to start matching roles.',
};

export default function SignUpPage() {
  return (
    <AuthShell
      highlights={[
        'Smart AI Skill Matching',
        'All Top Local Portals Unified',
      ]}
    >
      <Suspense
        fallback={
          <p className="text-sm text-on-surface-variant">Loading…</p>
        }
      >
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
