'use client';

import type { EntryData, ResumeEntry, SectionType } from '@pypr/resume-core';
import { useId, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, EyeIcon, EyeOffIcon, TrashIcon } from '@/components/icons';
import { Field, TextAreaField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { ENTRY_FIELDS, entryLabel, listCodec, type FieldSpec } from './fields';
import { IconButton } from './icon-button';
import { RichTextField } from './rich-text-field';

interface EntryEditorProps {
  type: SectionType;
  entry: ResumeEntry;
  index: number;
  count: number;
  /** Validation messages keyed by field name. */
  errors: Map<string, string>;
  onChange: (patch: Partial<EntryData>) => void;
  onMove: (toIndex: number) => void;
  onToggleVisible: () => void;
  onRemove: () => void;
}

export function EntryEditor({
  type,
  entry,
  index,
  count,
  errors,
  onChange,
  onMove,
  onToggleVisible,
  onRemove,
}: EntryEditorProps) {
  const label = entryLabel(type, entry.data);
  const [expanded, setExpanded] = useState(label === '');
  const panelId = useId();
  const data = entry.data as Record<string, unknown>;
  const hasErrors = errors.size > 0;

  return (
    <div
      className={cn('rounded-lg border border-line bg-canvas/40', !entry.visible && 'opacity-60')}
    >
      <div className="flex items-center gap-1 py-1 pr-1 pl-3">
        <button
          type="button"
          aria-expanded={expanded || hasErrors}
          aria-controls={panelId}
          onClick={() => {
            setExpanded((e) => !e);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"
        >
          <ChevronDownIcon
            className={cn(
              'h-4 w-4 shrink-0 text-ink-subtle transition',
              !(expanded || hasErrors) && '-rotate-90',
            )}
          />
          <span className={cn('truncate', !label && 'text-ink-subtle')}>
            {label || 'New entry'}
          </span>
          {hasErrors && <span className="text-xs text-danger">Needs a fix</span>}
        </button>
        <IconButton
          label="Move up"
          disabled={index === 0}
          onClick={() => {
            onMove(index - 1);
          }}
        >
          <ChevronUpIcon className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Move down"
          disabled={index === count - 1}
          onClick={() => {
            onMove(index + 1);
          }}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={entry.visible ? 'Hide from resume' : 'Show on resume'}
          onClick={onToggleVisible}
        >
          {entry.visible ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
        </IconButton>
        <IconButton label="Delete entry" onClick={onRemove}>
          <TrashIcon className="h-4 w-4" />
        </IconButton>
      </div>

      {(expanded || hasErrors) && (
        <div id={panelId} className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          {ENTRY_FIELDS[type].map((field) => (
            <EntryField
              key={field.key}
              field={field}
              value={data[field.key]}
              disabled={field.key === 'endDate' && data.current === true}
              error={errors.get(field.key)}
              onChange={(value) => {
                onChange({ [field.key]: value });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryField({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const span = field.half ? '' : 'sm:col-span-2';
  const text = typeof value === 'string' ? value : '';
  switch (field.kind) {
    case 'checkbox':
      return (
        <label className={cn('flex items-center gap-2 self-end pb-2.5 text-sm', span)}>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => {
              onChange(e.target.checked);
            }}
            className="h-4 w-4 accent-current"
          />
          {field.label}
        </label>
      );
    case 'richtext':
      return (
        <RichTextField
          className={span}
          label={field.label}
          hint={field.hint}
          error={error}
          value={text}
          onChange={(value) => {
            onChange(value);
          }}
        />
      );
    case 'textarea':
      return (
        <TextAreaField
          className={span}
          label={field.label}
          hint={field.hint}
          error={error}
          value={text}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      );
    case 'lines':
    case 'tags': {
      const codec = listCodec[field.kind];
      const items = Array.isArray(value) ? (value as string[]) : [];
      const common = {
        className: span,
        label: field.label,
        hint: field.hint,
        error,
        placeholder: field.placeholder,
        value: codec.toText(items),
      };
      return field.kind === 'lines' ? (
        <TextAreaField
          {...common}
          onChange={(e) => {
            onChange(codec.toItems(e.target.value));
          }}
        />
      ) : (
        <TagsField {...common} items={items} onItems={onChange} />
      );
    }
    case 'month':
      return (
        <Field
          className={span}
          label={field.label}
          inputMode="numeric"
          placeholder="YYYY-MM"
          hint="YYYY-MM, or just the year"
          disabled={disabled}
          error={error}
          value={disabled ? '' : text}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      );
    case 'text':
      return (
        <Field
          className={span}
          label={field.label}
          hint={field.hint}
          placeholder={field.placeholder}
          error={error}
          value={text}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      );
  }
}

/** Comma-separated tags: shows "a, b, c"; while focused it keeps exactly what the user typed. */
function TagsField({
  items,
  onItems,
  value: _value,
  ...field
}: Omit<Parameters<typeof Field>[0], 'onChange' | 'onFocus' | 'onBlur'> & {
  items: string[];
  onItems: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Field
      {...field}
      value={draft ?? listCodec.tags.toText(items)}
      onFocus={() => {
        setDraft(listCodec.tags.toText(items));
      }}
      onBlur={() => {
        setDraft(null);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onItems(listCodec.tags.toItems(e.target.value));
      }}
    />
  );
}
