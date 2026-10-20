'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';
import { inputClass } from '@/components/ui/field';
import { cn } from '@/lib/cn';

export function PasswordField({
  label,
  hint,
  error,
  ...input
}: { label: string; hint?: string; error?: string | undefined } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'className'
>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={cn(inputClass, 'h-10 pr-16')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...input}
        />
        <button
          type="button"
          onClick={() => {
            setVisible((v) => !v);
          }}
          className="absolute inset-y-1 right-1 rounded-md px-2 text-xs text-ink-muted hover:text-ink"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
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
