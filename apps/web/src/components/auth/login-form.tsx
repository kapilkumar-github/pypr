'use client';

import { AUTH_ERROR_CODES, loginRequestSchema } from '@pypr/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { PasswordField } from '@/components/auth/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError, apiRequest } from '@/lib/api';
import { useRedirectIfSignedIn } from '@/lib/session';

type Problem = { kind: 'error'; message: string } | { kind: 'unverified' } | null;

export function LoginForm({
  initialEmail,
  notice,
  next,
}: {
  initialEmail: string;
  notice: 'exists' | 'verified' | null;
  next: string;
}) {
  const router = useRouter();
  useRedirectIfSignedIn(next);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [resent, setResent] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setProblem({ kind: 'error', message: 'Enter your email and password.' });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await apiRequest('/api/auth/login', { method: 'POST', body: parsed.data });
      router.replace(next);
    } catch (error) {
      if (error instanceof ApiError && error.code === AUTH_ERROR_CODES.emailNotVerified) {
        setProblem({ kind: 'unverified' });
      } else {
        setProblem({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not sign in.',
        });
      }
      setBusy(false);
    }
  }

  async function resend() {
    await apiRequest('/api/auth/resend-verification', {
      method: 'POST',
      body: { email: email.trim() },
    }).catch(() => undefined);
    setResent(true);
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">Welcome back to Pypr.</p>

      {notice === 'exists' && (
        <Alert className="mt-6">
          You already have an account with this email. Sign in instead.
        </Alert>
      )}

      <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />

        {problem?.kind === 'error' && <Alert tone="error">{problem.message}</Alert>}
        {problem?.kind === 'unverified' && (
          <Alert tone="error">
            Verify your email before signing in.{' '}
            {resent ? (
              <span>A new link is on its way.</span>
            ) : (
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => void resend()}
              >
                Send a new link
              </button>
            )}
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        New to Pypr?{' '}
        <Link href="/register" className="font-medium text-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </section>
  );
}
