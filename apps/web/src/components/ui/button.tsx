import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary/90',
  secondary: 'bg-secondary text-ink hover:bg-secondary/70',
  ghost: 'text-ink-muted hover:bg-ink/[0.06] hover:text-ink',
  danger: 'bg-danger text-canvas hover:bg-danger/90',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-xs',
  md: 'h-10 gap-2 rounded-lg px-4 text-sm',
  lg: 'h-12 gap-2 rounded-lg px-6 text-sm',
};

export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition',
    'focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />;
}
