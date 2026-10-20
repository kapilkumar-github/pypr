import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { safeNextPath } from '@/lib/redirect';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : undefined;
  const notice = first(params.notice);
  return (
    <LoginForm
      initialEmail={first(params.email) ?? ''}
      notice={notice === 'exists' || notice === 'verified' ? notice : null}
      next={safeNextPath(first(params.next))}
    />
  );
}
