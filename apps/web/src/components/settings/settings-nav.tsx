'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { PaletteIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

/** Settings categories. Add Account, Security, … here as they get real settings. */
export const SETTINGS_SECTIONS: {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [{ href: '/settings/appearance', label: 'Appearance', Icon: PaletteIcon }];

/** Vertical list on wide screens, a horizontal strip on phones. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {SETTINGS_SECTIONS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none',
                  active
                    ? 'bg-ink/[0.07] font-medium text-ink'
                    : 'text-ink-muted hover:bg-ink/[0.04] hover:text-ink',
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-highlight' : 'text-ink-subtle')} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
