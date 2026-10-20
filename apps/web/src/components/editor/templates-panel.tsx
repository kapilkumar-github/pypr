'use client';

import {
  RESUME_DENSITIES,
  RESUME_FONTS,
  type ResumeContent,
  type ResumeSettings,
} from '@pypr/resume-core';
import {
  DENSITY_SCALE,
  FONT_STACKS,
  TEMPLATES,
  isHexColor,
  readableTextOn,
  renderResumeHtml,
} from '@pypr/templates';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import { CheckIcon } from '@/components/icons';
import { inputClass } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/** Curated accents, balanced for the dark workspace (all take dark text). */
export const ACCENT_PRESETS = [
  { name: 'Neon lime', value: '#B7FF3C' },
  { name: 'Electric violet', value: '#A78BFA' },
  { name: 'Cyan', value: '#22D3EE' },
  { name: 'Blue', value: '#60A5FA' },
  { name: 'Coral', value: '#FF7A6B' },
  { name: 'Amber', value: '#FBBF24' },
  { name: 'Pink', value: '#F472B6' },
] as const;

const THUMB_WIDTH = 168;
const PAGE_WIDTH = 794; // A4 at 96 dpi
const PAGE_HEIGHT = 1123;

/** The Templates tab: template choice (one real template for now) and design settings. */
export function TemplatesPanel({
  content,
  onTemplate,
  onSettings,
}: {
  content: ResumeContent;
  onTemplate: (template: string) => void;
  onSettings: (patch: Partial<ResumeSettings>) => void;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="templates-heading">
        <h2 id="templates-heading" className="text-sm font-semibold">
          Template
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="templates-heading"
          className="mt-3 flex flex-wrap gap-4"
        >
          {TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              id={template.id}
              name={template.name}
              description={template.description}
              selected={content.template === template.id}
              content={content}
              onSelect={() => {
                onTemplate(template.id);
              }}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="design-heading" className="space-y-6">
        <div>
          <h2 id="design-heading" className="text-sm font-semibold">
            Design
          </h2>
          <p className="mt-1 text-xs text-ink-subtle">Applies to this resume only.</p>
        </div>
        <AccentPicker
          value={content.settings.accentColor}
          onChange={(accentColor) => {
            onSettings({ accentColor });
          }}
        />
        <FontPicker
          value={content.settings.font}
          onChange={(font) => {
            onSettings({ font });
          }}
        />
        <DensityPicker
          value={content.settings.density}
          onChange={(density) => {
            onSettings({ density });
          }}
        />
      </section>
    </div>
  );
}

function TemplateCard({
  id,
  name,
  description,
  selected,
  content,
  onSelect,
}: {
  id: string;
  name: string;
  description: string;
  selected: boolean;
  content: ResumeContent;
  onSelect: () => void;
}) {
  // A real thumbnail: this resume rendered with this template and its settings.
  const deferred = useDeferredValue(content);
  const html = useMemo(() => renderResumeHtml({ ...deferred, template: id }), [deferred, id]);
  const scale = THUMB_WIDTH / PAGE_WIDTH;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group w-[calc(168px+1.5rem)] rounded-xl border bg-surface p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none',
        selected ? 'border-highlight' : 'border-line hover:border-ink/30',
      )}
    >
      <div
        className="overflow-hidden rounded-md border border-line bg-white"
        style={{ width: THUMB_WIDTH, height: PAGE_HEIGHT * scale * 0.62 }}
      >
        <iframe
          title={`${name} template preview`}
          aria-hidden="true"
          tabIndex={-1}
          sandbox=""
          srcDoc={html}
          className="pointer-events-none origin-top-left border-0"
          style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${String(scale)})` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{name}</span>
        {selected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-ink">
            <CheckIcon className="h-3 w-3" />
            Selected
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-subtle">{description}</p>
    </button>
  );
}

function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const groupId = useId();
  const isPreset = ACCENT_PRESETS.some((p) => p.value === value.toUpperCase());
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const showCustom = customOpen || !isPreset;

  const applyDraft = (raw: string) => {
    const next = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    setDraft(raw);
    if (isHexColor(next)) {
      setError(null);
      onChange(next.toUpperCase());
    } else {
      setError('Use a 6-digit hex color, like #B7FF3C.');
    }
  };

  const swatch = (selected: boolean) =>
    cn(
      'relative flex size-8 items-center justify-center rounded-full border transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-highlight peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface',
      selected
        ? 'scale-110 border-ink ring-2 ring-ink/70 ring-offset-2 ring-offset-surface'
        : 'border-ink/20 hover:scale-105',
    );

  return (
    <fieldset>
      <legend className="text-sm font-medium">Accent color</legend>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {ACCENT_PRESETS.map((preset) => {
          const selected = !customOpen && value.toUpperCase() === preset.value;
          return (
            <label key={preset.value} title={preset.name} className="cursor-pointer">
              <input
                type="radio"
                name={groupId}
                className="peer sr-only"
                checked={selected}
                onChange={() => {
                  setCustomOpen(false);
                  setError(null);
                  setDraft(preset.value);
                  onChange(preset.value);
                }}
              />
              <span className={swatch(selected)} style={{ backgroundColor: preset.value }}>
                {selected && (
                  <CheckIcon className="size-4" style={{ color: readableTextOn(preset.value) }} />
                )}
              </span>
              <span className="sr-only">{preset.name}</span>
            </label>
          );
        })}
        <label title="Custom color" className="cursor-pointer">
          <input
            type="radio"
            name={groupId}
            className="peer sr-only"
            checked={showCustom}
            onChange={() => {
              setCustomOpen(true);
              setDraft(value);
            }}
          />
          <span
            className={swatch(showCustom)}
            style={{
              background: showCustom
                ? value
                : 'conic-gradient(#ff6b6b, #fbbf24, #b7ff3c, #22d3ee, #60a5fa, #a78bfa, #f472b6, #ff6b6b)',
            }}
          >
            {showCustom && (
              <CheckIcon className="size-4" style={{ color: readableTextOn(value) }} />
            )}
          </span>
          <span className="sr-only">Custom</span>
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
        {showCustom
          ? 'Custom'
          : (ACCENT_PRESETS.find((p) => p.value === value.toUpperCase())?.name ?? 'Custom')}{' '}
        · <span className="font-mono">{value.toUpperCase()}</span>
      </p>

      {showCustom && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <input
            type="color"
            aria-label="Pick a custom accent color"
            value={isHexColor(value) ? value.toLowerCase() : '#b7ff3c'}
            onChange={(e) => {
              applyDraft(e.target.value);
            }}
            className="h-9 w-12 cursor-pointer rounded-md border border-line bg-canvas p-1"
          />
          <div>
            <input
              aria-label="Custom accent hex code"
              value={draft}
              maxLength={7}
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${groupId}-error` : undefined}
              onChange={(e) => {
                applyDraft(e.target.value);
              }}
              className={cn(inputClass, 'h-9 w-28 font-mono uppercase')}
            />
            {error && (
              <p id={`${groupId}-error`} className="mt-1 text-xs text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Live sample of the accent as the app and the resume use it. */}
      <div
        className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-canvas p-3"
        aria-hidden="true"
      >
        <span
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ backgroundColor: value, color: readableTextOn(value) }}
        >
          Primary action
        </span>
        <span className="h-4 w-px bg-line" />
        <span className="text-xs text-ink-muted">
          Resume headings use a print-safe shade of this color.
        </span>
      </div>
    </fieldset>
  );
}

function FontPicker({
  value,
  onChange,
}: {
  value: ResumeSettings['font'];
  onChange: (font: ResumeSettings['font']) => void;
}) {
  const id = useId();
  const group = (kind: 'sans' | 'serif') =>
    RESUME_FONTS.filter((f) => FONT_STACKS[f].kind === kind);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        Font
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value as ResumeSettings['font']);
        }}
        className={cn(inputClass, 'mt-2 h-9 w-full max-w-xs')}
      >
        <optgroup label="Sans-serif">
          {group('sans').map((f) => (
            <option key={f} value={f}>
              {FONT_STACKS[f].label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Serif">
          {group('serif').map((f) => (
            <option key={f} value={f}>
              {FONT_STACKS[f].label}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="mt-2 text-sm text-ink-muted" style={{ fontFamily: FONT_STACKS[value].stack }}>
        Senior Engineer · Built the billing platform
      </p>
    </div>
  );
}

function DensityPicker({
  value,
  onChange,
}: {
  value: ResumeSettings['density'];
  onChange: (density: ResumeSettings['density']) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium">Density</legend>
      <div className="mt-2 inline-flex rounded-lg border border-line bg-canvas p-0.5">
        {RESUME_DENSITIES.map((density) => (
          <label key={density} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={density}
              checked={value === density}
              onChange={() => {
                onChange(density);
              }}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block rounded-md px-3 py-1.5 text-xs transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-highlight',
                value === density
                  ? 'bg-elevated font-medium text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {DENSITY_SCALE[density].label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
