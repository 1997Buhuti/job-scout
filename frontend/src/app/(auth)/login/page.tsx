import type { Metadata } from 'next';

import { AuthShell } from '@/features/auth/components/AuthShell';
import { SignInForm } from '@/features/auth/components/SignInForm';

export const metadata: Metadata = {
  title: 'Sign In — Job Scout',
  description: 'Sign in to Job Scout to manage your profile and job matches.',
};

export default function LoginPage() {
  return (
    <AuthShell
      showTrustFooter
      highlights={[
        'Smart CV Matching & Insights',
        'All Sri Lankan Portals in One Place',
      ]}
    >
      <SignInForm />
    </AuthShell>
  );
}
