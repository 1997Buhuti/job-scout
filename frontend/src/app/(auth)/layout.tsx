import type { ReactNode } from 'react';

/**
 * Auth route group layout — no URL segment; shared wrapper for login/signup.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
