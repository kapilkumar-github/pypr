'use client';

import type { ComponentType, SVGProps } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';
import type { ThemePreference } from '@/lib/theme';
import { useThemePreference } from '@/lib/theme-store';

const options: {
  value: ThemePreference;
  label: string;
  hint: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  swatch: string;
}[] = [
  {
    value: 'dark',
    label: 'Dark',
    hint: 'Dark surfaces',
    Icon: MoonIcon,
    swatch: 'bg-[#090a0b]',
  },
  {
    value: 'light',
    label: 'Light',
    hint: 'Bright surfaces',
    Icon: SunIcon,
    swatch: 'bg-[#ffffff]',
  },
  {
    value: 'system',
    label: 'System',
    hint: 'Match your device (default)',
    Icon: MonitorIcon,
    swatch: 'bg-[linear-gradient(135deg,#090a0b_50%,#ffffff_50%)]',
  },
];

/** Theme cards. `onSelect` applies and saves the choice (see AppearanceSettings). */
export function ThemeSwitcher({ onSelect }: { onSelect: (theme: ThemePreference) => void }) {
  const current = useThemePreference();

  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map(({ value, label, hint, Icon, swatch }) => (
          <label
            key={value}
            className="group cursor-pointer rounded-xl border border-line bg-surface p-3 transition hover:border-ink/25 has-checked:border-highlight has-focus-visible:ring-2 has-focus-visible:ring-highlight"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={current === value}
              onChange={() => {
                onSelect(value);
              }}
              className="sr-only"
            />
            {/* Fixed colors: each swatch previews its theme regardless of the active one. */}
            <span
              aria-hidden="true"
              className={`block h-16 rounded-lg border border-ink/10 ${swatch}`}
            />
            <span className="mt-3 flex items-center gap-2 text-sm font-medium">
              <Icon className="h-4 w-4 text-ink-muted group-has-checked:text-ink" />
              {label}
            </span>
            <span className="mt-0.5 block text-xs text-ink-subtle">{hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
