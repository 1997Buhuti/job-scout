'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { confirmSignUp, resendSignUpCode, signUp } from 'aws-amplify/auth';

function fieldClassName() {
  return 'w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:border-secondary';
}

const ROLE_OPTIONS = [
  'Fullstack Engineer',
  'Cloud Architect',
  'Backend Specialist',
] as const;

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmEmailParam = searchParams.get('confirm');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [targetRole, setTargetRole] = useState<string>(ROLE_OPTIONS[0]);
  const [agreed, setAgreed] = useState(true);
  const [code, setCode] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(Boolean(confirmEmailParam));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (confirmEmailParam) {
      setEmail(confirmEmailParam);
      setNeedsConfirm(true);
    }
  }, [confirmEmailParam]);

  async function onSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!agreed) {
      setError('Please agree to the terms & privacy policy.');
      return;
    }

    setPending(true);

    try {
      const result = await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: {
            email: email.trim(),
            name: fullName.trim() || undefined,
          },
        },
      });

      // Persist intended role for profile settings (F4) — Cognito does not store this.
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'jobscout.pendingTargetRole',
          targetRole,
        );
      }

      if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        setNeedsConfirm(true);
        setInfo('We sent a verification code to your email.');
        return;
      }

      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed.');
    } finally {
      setPending(false);
    }
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    try {
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: code.trim(),
      });
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed.');
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      await resendSignUpCode({ username: email.trim() });
      setInfo('Verification code resent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setPending(false);
    }
  }

  if (needsConfirm) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-medium tracking-tight text-on-surface">
            Verify Your Email
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Enter the code we sent to {email || 'your inbox'}.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onConfirm}>
          <div>
            <label className="mb-1 block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
              Verification Code
            </label>
            <input
              className={fieldClassName()}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-sm text-secondary">
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary py-3 text-sm font-medium text-on-secondary shadow-[0_0_20px_rgba(78,222,163,0.3)] transition-all hover:bg-secondary-fixed disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">verified</span>
            {pending ? 'Confirming…' : 'Confirm Account'}
          </button>

          <button
            type="button"
            onClick={onResend}
            disabled={pending || !email}
            className="w-full text-sm text-secondary hover:underline disabled:opacity-60"
          >
            Resend code
          </button>

          <p className="pt-2 text-center text-sm text-on-surface-variant">
            <Link href="/login" className="font-medium text-secondary hover:underline">
              Back to Sign In
            </Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-medium tracking-tight text-on-surface">
          Create Your Account
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Register your credentials to start your automated job scout journey.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSignUp}>
        <div>
          <label className="mb-1 block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
            Full Name
          </label>
          <input
            className={fieldClassName()}
            type="text"
            autoComplete="name"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

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
          <label className="mb-1 block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
            Password
          </label>
          <input
            className={fieldClassName()}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <div>
          <label className="mb-1 block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
            Confirm Password
          </label>
          <input
            className={fieldClassName()}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <div>
          <label className="mb-1 block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
            Target Primary Role
          </label>
          <select
            className={fieldClassName()}
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 py-1">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-secondary"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-sm text-on-surface-variant">
            I agree to terms &amp; privacy policy
          </span>
        </label>

        {error ? (
          <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-sm text-secondary">
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary py-3 text-sm font-medium text-on-secondary shadow-[0_0_20px_rgba(78,222,163,0.3)] transition-all hover:bg-secondary-fixed disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          {pending ? 'Creating account…' : 'Create Account'}
        </button>

        <p className="pt-4 text-center text-sm text-on-surface-variant">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-secondary hover:underline">
            Sign In
          </Link>
        </p>
      </form>
    </div>
  );
}
