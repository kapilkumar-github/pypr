'use client';

import { isHexColor, readableTextOn } from '@pypr/templates';
import { useId, useState, type ReactNode } from 'react';
import { CheckIcon } from '@/components/icons';
import { inputClass } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/** Curated accents, balanced for the dark workspace (all take dark text). Used by the app
 * accent (Settings) and each resume's accent (Templates); the two are never linked. */
export const ACCENT_PRESETS = [
  { name: 'Neon lime', value: '#B7FF3C' },
  { name: 'Electric violet', value: '#A78BFA' },
  { name: 'Cyan', value: '#22D3EE' },
  { name: 'Blue', value: '#60A5FA' },
  { name: 'Coral', value: '#FF7A6B' },
  { name: 'Amber', value: '#FBBF24' },
  { name: 'Pink', value: '#F472B6' },
] as const;

/** Preset swatches plus Custom (color picker and validated hex). */
export function AccentPicker({
  value,
  onChange,
  legend = 'Accent color',
  children,
}: {
  value: string;
  onChange: (hex: string) => void;
  legend?: string;
  /** A live sample of where the color is used. */
  children?: ReactNode;
}) {
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
      <legend className="text-sm font-medium">{legend}</legend>
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

      {children}
    </fieldset>
  );
}
