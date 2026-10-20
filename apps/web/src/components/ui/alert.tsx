import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  info: 'border-line bg-surface text-ink',
  success: 'border-success/40 bg-success/10 text-ink',
  error: 'border-danger/40 bg-danger/10 text-ink',
} as const;

export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border p-3 text-sm leading-relaxed', tones[tone], className)}
    >
      {children}
    </div>
  );
}
