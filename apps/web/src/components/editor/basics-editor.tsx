'use client';

import type { Basics } from '@pypr/resume-core';
import { useId, type ReactNode } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { RichTextField } from './rich-text-field';

const fields: {
  key: keyof Basics;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}[] = [
  { key: 'fullName', label: 'Full name', autoComplete: 'name' },
  { key: 'headline', label: 'Headline', placeholder: 'e.g. Senior Product Designer' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { key: 'location', label: 'Location', placeholder: 'City, Country' },
];

/** Personal details, as an accordion item like the sections (not reorderable: always first). */
export function BasicsEditor({
  basics,
  errors,
  expanded,
  onToggleExpanded,
  onChange,
  photo,
}: {
  basics: Basics;
  errors: Map<string, string>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (patch: Partial<Basics>) => void;
  /** The photo control, saved separately from these fields. */
  photo?: ReactNode;
}) {
  const panelId = useId();
  const open = expanded || errors.size > 0;
  return (
    <section aria-label="Personal details" className="rounded-xl border border-line bg-surface">
      <h2 className="px-2 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggleExpanded}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
        >
          <ChevronDownIcon
            className={cn(
              'h-4 w-4 shrink-0 text-ink-subtle transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className="truncate text-base font-semibold">Personal details</span>
          {!open && basics.fullName && (
            <span className="truncate text-xs font-normal text-ink-subtle">{basics.fullName}</span>
          )}
          {errors.size > 0 && (
            <span className="shrink-0 text-xs font-normal text-danger">Needs a fix</span>
          )}
        </button>
      </h2>
      <div
        id={panelId}
        hidden={!open}
        className="grid gap-4 border-t border-line p-4 sm:grid-cols-2"
      >
        {photo}
        {fields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            type={field.type ?? 'text'}
            autoComplete={field.autoComplete}
            placeholder={field.placeholder}
            error={errors.get(field.key)}
            value={basics[field.key]}
            onChange={(e) => {
              onChange({ [field.key]: e.target.value });
            }}
          />
        ))}
        <RichTextField
          className="sm:col-span-2"
          label="Professional summary"
          hint="Two or three sentences about what you do best."
          error={errors.get('summary')}
          value={basics.summary}
          onChange={(summary) => {
            onChange({ summary });
          }}
        />
      </div>
    </section>
  );
}
