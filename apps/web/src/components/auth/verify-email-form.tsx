'use client';

import { emailSchema } from '@pypr/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { apiRequest } from '@/lib/api';
import { classifyVerifyError, type Outcome } from '@/lib/verify-outcome';

type State = { step: 'verifying' } | { step: Outcome } | { step: 'missing' };

/** How long the success message shows before going to the resumes. */
const REDIRECT_DELAY_MS = 900;

/**
 * One request per token for the life of the page: React Strict Mode, remounts and re-renders
 * all share it, so a one-time token is never sent twice by accident. Kept in memory only.
 */
const attempts = new Map<string, Promise<Outcome>>();

async function verifyOnce(token: string): Promise<Outcome> {
  try {
    await apiRequest('/api/auth/verify-email', { method: 'POST', body: { token } });
    return 'verified';
  } catch (error) {
    return classifyVerifyError(error);
  }
}

function verify(token: string, fresh = false): Promise<Outcome> {
  if (fresh) attempts.delete(token);
  let attempt = attempts.get(token);
  if (!attempt) {
    attempt = verifyOnce(token);
    attempts.set(token, attempt);
  }
  return attempt;
}

/**
 * Verifies as soon as the emailed link opens (decision D28, replacing D14's button), then goes
 * to the resumes. The API keeps the checks: single use, expiry, and no session for a used link.
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>(token ? { step: 'verifying' } : { step: 'missing' });

  // Drop the token from the address bar and history once it's in memory.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', '/verify-email');
  }, []);

  const run = useCallback(
    (fresh: boolean) => {
      let cancelled = false;
      // A function, so the check after an await reads the current value.
      const stopped = () => cancelled;
      void verify(token, fresh).then(async (outcome) => {
        if (stopped()) return;
        if (outcome === 'already-verified') {
          // Opened twice in this browser: already signed in, so just carry on.
          const signedIn = await apiRequest('/api/auth/me').then(
            () => true,
            () => false,
          );
          if (stopped()) return;
          if (signedIn) {
            router.replace('/dashboard');
            return;
          }
        }
        setState({ step: outcome });
      });
      return () => {
        cancelled = true;
      };
    },
    [token, router],
  );

  useEffect(() => (token ? run(false) : undefined), [token, run]);

  useEffect(() => {
    if (state.step !== 'verified') return;
    const timer = window.setTimeout(() => {
      router.replace('/dashboard');
    }, REDIRECT_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state.step, router]);

  switch (state.step) {
    case 'verifying':
      return (
        <section role="status" aria-live="polite">
          <Spinner />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Verifying your email…</h1>
          <p className="mt-2 text-ink-muted">This only takes a moment.</p>
        </section>
      );
    case 'verified':
      return (
        <section role="status" aria-live="polite">
          <h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
          <p className="mt-2 text-ink-muted">You&apos;re signed in. Taking you to your resumes…</p>
          <Link href="/dashboard" className={`${buttonClass} mt-8`}>
            Go to your resumes
          </Link>
        </section>
      );
    case 'already-verified':
      return (
        <section aria-live="polite">
          <h1 className="text-2xl font-semibold tracking-tight">Your email is already verified</h1>
          <p className="mt-2 text-ink-muted">This link was already used. Sign in to continue.</p>
          <Link href="/login?next=%2Fdashboard" className={`${buttonClass} mt-8`}>
            Sign in
          </Link>
        </section>
      );
    case 'retry':
      return (
        <section aria-live="polite">
          <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t reach Pypr</h1>
          <p className="mt-2 text-ink-muted">
            Check your connection and try again. Your link still works.
          </p>
          <button
            type="button"
            className={`${buttonClass} mt-8`}
            onClick={() => {
              setState({ step: 'verifying' });
              run(true);
            }}
          >
            Try again
          </button>
        </section>
      );
    case 'expired':
    case 'invalid':
    case 'missing':
      return (
        <section aria-live="polite">
          <h1 className="text-2xl font-semibold tracking-tight">
            {state.step === 'expired' ? 'This link has expired' : "We couldn't verify your email"}
          </h1>
          <p className="mt-2 text-ink-muted">
            {state.step === 'expired'
              ? 'Verification links work for 24 hours. We can send you a new one.'
              : state.step === 'missing'
                ? 'This link is incomplete. Open the link from the email again, or get a new one.'
                : 'This link is invalid or has already been used. You can get a new one.'}
          </p>
          <ResendForm />
        </section>
      );
  }
}

const buttonClass =
  'flex h-11 w-full items-center justify-center rounded-lg bg-ink px-5 text-sm font-medium text-canvas transition hover:bg-ink/90 disabled:opacity-60';

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="block h-8 w-8 animate-spin rounded-full border-2 border-line border-t-highlight motion-reduce:animate-none"
    />
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
