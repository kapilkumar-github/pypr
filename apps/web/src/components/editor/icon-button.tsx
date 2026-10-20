import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Small square button with an icon; `label` is required for screen readers. */
export function IconButton({
  label,
  children,
  className,
  ...props
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
