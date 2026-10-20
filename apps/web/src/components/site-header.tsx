import type { ReactNode } from 'react';
import { AppLogo } from './app-logo';

export const headerLinkClass =
  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition hover:text-ink hover:underline hover:underline-offset-4';

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-20 mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 lg:px-8">
      <AppLogo />
      <nav className="flex items-center gap-1">{children}</nav>
    </header>
  );
}
