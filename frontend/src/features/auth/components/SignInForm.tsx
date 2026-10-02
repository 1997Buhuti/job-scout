'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { signIn } from 'aws-amplify/auth';

import { useUserProfile } from '@/features/profile/context/UserProfileContext';

function fieldClassName() {
  return 'w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:border-secondary';
}

export function SignInForm() {
  const router = useRouter();
  const { refresh } = useUserProfile();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await signIn({ username: email.trim(), password });

      if (result.isSignedIn) {
        await refresh(true);
        router.replace('/');
        router.refresh();
        return;
      }

      if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        router.push(`/signup?confirm=${encodeURIComponent(email.trim())}`);
        return;
      }

      setError('Additional sign-in steps are required. Check your email or try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-medium tracking-tight text-on-surface">
          Sign In to Your Account
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Enter your credentials to access your recruitment dashboard.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
            Email or Cognito Username
          </label>
          <input
            className={fieldClassName()}
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
              Password
            </label>
            <span className="text-sm text-secondary/70">Forgot password?</span>
          </div>
          <input
            className={fieldClassName()}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 py-1">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-secondary"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span className="text-sm text-on-surface-variant">Remember this device</span>
        </label>

        {error ? (
          <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary py-3 text-sm font-medium text-on-secondary shadow-[0_0_20px_rgba(78,222,163,0.3)] transition-all hover:bg-secondary-fixed disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">lock</span>
          {pending ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="pt-4 text-center text-sm text-on-surface-variant">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-secondary hover:underline">
            Sign Up
          </Link>
        </p>
      </form>
    </div>
  );
}
