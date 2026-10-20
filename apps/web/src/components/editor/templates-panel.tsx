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
  ensureContrast,
  isHexColor,
  renderResumeHtml,
} from '@pypr/templates';
import { useDeferredValue, useId, useMemo } from 'react';
import { AccentPicker } from '@/components/accent-picker';
import { CheckIcon } from '@/components/icons';
import { inputClass } from '@/components/ui/field';
import { cn } from '@/lib/cn';

const THUMB_WIDTH = 168;
const PAGE_WIDTH = 794; // A4 at 96 dpi
const PAGE_HEIGHT = 1123;

/** The Templates tab: template choice (one real template for now) and design settings. */
export function TemplatesPanel({
  content,
  onTemplate,
  onSettings,
  photo,
}: {
  content: ResumeContent;
  /** The resume's photo as a data: URI, for the thumbnails. */
  photo?: string | undefined;
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
              photo={photo}
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
          legend="Resume accent"
          value={content.settings.accentColor}
          onChange={(accentColor) => {
            onSettings({ accentColor });
          }}
        >
          <ResumeAccentSample accent={content.settings.accentColor} />
        </AccentPicker>
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
  photo,
  onSelect,
}: {
  id: string;
  name: string;
  description: string;
  selected: boolean;
  content: ResumeContent;
  photo: string | undefined;
  onSelect: () => void;
}) {
  // A real thumbnail: this resume rendered with this template and its settings.
  const deferred = useDeferredValue(content);
  const html = useMemo(
    () => renderResumeHtml({ ...deferred, template: id }, { photo }),
    [deferred, id, photo],
  );
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

/**
 * The accent as the resume prints it: a section heading on white paper, in the print-safe shade.
 * It colors only this resume, never the Pypr interface around it.
 */
function ResumeAccentSample({ accent }: { accent: string }) {
  const safe = isHexColor(accent) ? accent : '#B7FF3C';
  return (
    <div className="mt-4 rounded-lg border border-line bg-white p-3" aria-hidden="true">
      <p
        className="border-b pb-1 text-[10px] font-bold tracking-[0.12em] uppercase"
        style={{
          color: ensureContrast(safe, '#FFFFFF', 4.5),
          borderColor: ensureContrast(safe, '#FFFFFF', 3),
        }}
      >
        Experience
      </p>
      <p className="mt-1.5 text-[11px] text-zinc-600">
        Resume headings, dividers and bullets use a print-safe shade of this color.
      </p>
    </div>
  );
}
