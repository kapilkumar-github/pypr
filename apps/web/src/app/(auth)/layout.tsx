import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftIcon } from '@/components/icons';
import { LandingBackdrop } from '@/components/landing/landing-backdrop';
import { SiteHeader, headerLinkClass } from '@/components/site-header';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Sign up, sign in and email verification. Same backdrop as the landing page, with the form
 * on a surface card so it stays readable over the pattern.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <LandingBackdrop />
      <SiteHeader>
        <ThemeToggle />
        <Link href="/" className={headerLinkClass}>
          <ArrowLeftIcon className="h-4 w-4" />
          Home
        </Link>
      </SiteHeader>
      <main className="relative z-10 mx-auto w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
