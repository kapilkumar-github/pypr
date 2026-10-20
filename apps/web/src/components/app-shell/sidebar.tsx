'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { FileTextIcon, GearIcon, PanelLeftIcon, XIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Paths that count as this item (nested routes). */
  matches: (pathname: string) => boolean;
}

const PRIMARY: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Resumes',
    Icon: FileTextIcon,
    matches: (p) => p === '/dashboard' || p.startsWith('/resumes'),
  },
];

const SETTINGS: NavItem = {
  href: '/settings',
  label: 'Settings',
  Icon: GearIcon,
  matches: (p) => p.startsWith('/settings'),
};

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = item.matches(pathname);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors',
        'focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none',
        active
          ? 'bg-ink/[0.08] font-medium text-ink'
          : 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
    >
      <item.Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

const iconButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none';

/**
 * Sidebar contents, shared by the desktop sidebar and the mobile drawer: brand and toggle at the
 * top, primary navigation filling the middle, Settings anchored at the bottom.
 */
export function SidebarContent({
  collapsed,
  onToggle,
  onClose,
  onNavigate,
}: {
  collapsed: boolean;
  /** Desktop: collapse or expand. */
  onToggle?: () => void;
  /** Mobile drawer: close it. */
  onClose?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center px-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
            aria-label="Pypr home"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-canvas">
              <span className="font-display text-lg leading-none font-bold tracking-[-0.08em]">
                p*
              </span>
            </span>
            <span className="font-display text-lg font-bold tracking-[-0.06em]">pypr</span>
          </Link>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={iconButton}
          >
            <PanelLeftIcon className="h-[18px] w-[18px]" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close menu" className={iconButton}>
            <XIcon className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {PRIMARY.map((item) => (
            <li key={item.href}>
              <NavLink item={item} collapsed={collapsed} {...(onNavigate && { onNavigate })} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line px-2 py-2">
        <NavLink item={SETTINGS} collapsed={collapsed} {...(onNavigate && { onNavigate })} />
      </div>
    </div>
  );
}
