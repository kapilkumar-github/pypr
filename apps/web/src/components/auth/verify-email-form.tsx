'use client';

import { AUTH_ERROR_CODES, emailSchema } from '@pypr/validation';
import Link from 'next/link';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { ApiError, apiRequest } from '@/lib/api';

type State =
  | { step: 'ready' }
  | { step: 'verifying' }
  | { step: 'verified' }
  | { step: 'failed'; message: string; canResend: boolean };

const buttonClass =
  'flex h-11 w-full items-center justify-center rounded-lg bg-ink px-5 text-sm font-medium text-canvas transition hover:bg-ink/90 disabled:opacity-60';

/**
 * Verifies only when the user clicks: email scanners open links automatically, and a
 * verify-on-load page would let them use up the one-time token.
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const [state, setState] = useState<State>(
    token
      ? { step: 'ready' }
      : { step: 'failed', message: 'This link is missing its token.', canResend: true },
  );

  // Drop the token from the address bar and history once it's in memory.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', '/verify-email');
  }, []);

  async function verify() {
    setState({ step: 'verifying' });
    try {
      await apiRequest('/api/auth/verify-email', { method: 'POST', body: { token } });
      setState({ step: 'verified' });
    } catch (error) {
      setState({
        step: 'failed',
        message: error instanceof Error ? error.message : 'Could not verify your email.',
        canResend: error instanceof ApiError && error.code === AUTH_ERROR_CODES.invalidToken,
      });
    }
  }

  if (state.step === 'verified') {
    return (
      <section aria-live="polite">
        <h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
        <p className="mt-2 text-ink-muted">You&apos;re signed in. Welcome to Pypr.</p>
        <Link href="/dashboard" className={`${buttonClass} mt-8`}>
          Go to your resumes
        </Link>
      </section>
    );
  }

  if (state.step === 'failed') {
    return (
      <section aria-live="polite">
        <h1 className="text-2xl font-semibold tracking-tight">
          We couldn&apos;t verify your email
        </h1>
        <p className="mt-2 text-ink-muted">{state.message}</p>
        {state.canResend && <ResendForm />}
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
      <p className="mt-2 text-ink-muted">Confirm your email to finish creating your account.</p>
      <button
        type="button"
        className={`${buttonClass} mt-8`}
        disabled={state.step === 'verifying'}
        onClick={() => void verify()}
      >
        {state.step === 'verifying' ? 'Verifying…' : 'Verify my email'}
      </button>
    </section>
  );
}

function ResendForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'invalid'>('idle');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setStatus('invalid');
      return;
    }
    setStatus('sending');
    await apiRequest('/api/auth/resend-verification', {
      method: 'POST',
      body: { email: parsed.data },
    }).catch(() => undefined);
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <p className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm" aria-live="polite">
        If that account still needs verifying, a new link is on its way. Check your inbox.
      </p>
    );
  }

  return (
    <form className="mt-8 space-y-3" onSubmit={(event) => void submit(event)} noValidate>
      <label htmlFor="resend-email" className="block text-sm font-medium">
        Send a new link
      </label>
      <input
        id="resend-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setStatus('idle');
        }}
        aria-invalid={status === 'invalid'}
        aria-describedby={status === 'invalid' ? 'resend-email-error' : undefined}
        placeholder="you@example.com"
        className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-ink/40 focus:ring-2 focus:ring-highlight/60"
      />
      {status === 'invalid' && (
        <p id="resend-email-error" className="text-sm text-ink-muted">
          Enter a valid email address.
        </p>
      )}
      <button type="submit" className={buttonClass} disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send link'}
      </button>
    </form>
  );
}
