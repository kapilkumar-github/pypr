import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export const inputClass =
  'w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-highlight focus:ring-1 focus:ring-highlight aria-invalid:border-danger disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
}

/** A labelled input with hint and error text wired up for screen readers. */
export function Field({
  label,
  hint,
  error,
  className,
  ...input
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className={cn(inputClass, 'h-10')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  ...textarea
}: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        className={cn(inputClass, 'min-h-24 py-2 leading-relaxed')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...textarea}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
