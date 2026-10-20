'use client';

import { AUTH_ERROR_CODES, PASSWORD_MIN_LENGTH, registerRequestSchema } from '@pypr/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { PasswordField } from '@/components/auth/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError, apiRequest } from '@/lib/api';
import { useRedirectIfSignedIn } from '@/lib/session';

export function RegisterForm() {
  const router = useRouter();
  useRedirectIfSignedIn('/dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = registerRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email') next.email = 'Enter a valid email address.';
        if (field === 'password') next.password = issue.message;
      }
      setErrors(next);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await apiRequest('/api/auth/register', { method: 'POST', body: parsed.data });
      setSentTo(parsed.data.email);
    } catch (error) {
      if (error instanceof ApiError && error.code === AUTH_ERROR_CODES.emailAlreadyRegistered) {
        // Already has an account: send them to sign in with the email filled in.
        router.replace(`/login?email=${encodeURIComponent(parsed.data.email)}&notice=exists`);
        return;
      }
      setErrors({ form: error instanceof Error ? error.message : 'Could not create the account.' });
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <section aria-live="polite">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          We sent a link to <span className="font-medium text-ink">{sentTo}</span>. Open it to
          verify your email and finish creating your account.
        </p>
        <p className="mt-6 text-sm text-ink-muted">
          No email after a few minutes? Check spam, or{' '}
          {resent ? (
            <span>a new link is on its way.</span>
          ) : (
            <button
              type="button"
              className="font-medium text-ink underline underline-offset-2"
              onClick={() => {
                void apiRequest('/api/auth/resend-verification', {
                  method: 'POST',
                  body: { email: sentTo },
                }).catch(() => undefined);
                setResent(true);
              }}
            >
              send a new link
            </button>
          )}
          .
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-ink-muted">Build a resume you&apos;re proud of.</p>

      <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A short phrase works well.`}
          error={errors.password}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </section>
  );
}
