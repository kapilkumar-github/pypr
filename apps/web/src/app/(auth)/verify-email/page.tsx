import type { Metadata } from 'next';
import { VerifyEmailForm } from '@/components/auth/verify-email-form';

export const metadata: Metadata = {
  title: 'Verify your email',
  // The URL holds a one-time token: don't leak it to other sites.
  referrer: 'no-referrer',
  robots: { index: false },
};

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const { token } = await searchParams;
  return <VerifyEmailForm token={typeof token === 'string' ? token : ''} />;
}
