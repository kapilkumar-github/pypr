import Link from 'next/link';
import { LogInIcon } from '@/components/icons';
import { HeroVisual } from '@/components/landing/hero-visual';
import { LandingBackdrop } from '@/components/landing/landing-backdrop';
import { SiteHeader, headerLinkClass } from '@/components/site-header';
import { ThemeToggle } from '@/components/theme-toggle';

// This repo has no remote yet; this points at the earlier pypr-ui repository.
const GITHUB_URL = 'https://github.com/kapilkumar-github/pypr-ui';

export default function HomePage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <LandingBackdrop />

      <SiteHeader>
        <ThemeToggle />
        <Link href="/login" className={headerLinkClass}>
          <LogInIcon className="h-4 w-4" />
          Sign in
        </Link>
      </SiteHeader>

      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-7xl items-center px-6 py-20 lg:px-8">
        <div className="grid w-full items-center gap-16 lg:grid-cols-2 lg:gap-8">
          <div className="max-w-2xl">
            <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-ink/[0.03] px-3 py-1.5 text-xs text-ink-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Open source resume builder
            </p>

            <h1 className="text-5xl leading-[1.02] font-semibold tracking-[-0.045em] sm:text-6xl md:text-7xl">
              Your career.
              <br />
              <span className="text-ink-subtle">Beautifully documented.</span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
              Build a professional resume that looks as good as the work behind it. Open source,
              modern, and designed to help your experience stand out.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-ink transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_0_28px_var(--color-glow)]"
              >
                Build your resume
                <span className="ml-2" aria-hidden="true">
                  →
                </span>
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center justify-center rounded-lg border border-ink/10 bg-ink/[0.03] px-6 text-sm font-medium text-ink-muted transition hover:bg-ink/[0.07] hover:text-ink"
              >
                View on GitHub
              </a>
            </div>
          </div>

          <HeroVisual />
        </div>
      </main>
    </div>
  );
}
