'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { GearIcon, LogOutIcon } from '@/components/icons';
import { useSession } from '@/lib/session';

/** First letter of the email: users have no name or avatar yet. */
export function initialsOf(email: string): string {
  return (email.trim()[0] ?? '?').toUpperCase();
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-muted outline-none hover:bg-ink/[0.06] hover:text-ink focus-visible:bg-ink/[0.06] focus-visible:text-ink';

/** Avatar button in the top-right; opens the account menu (identity, Settings, Sign out). */
export function ProfileMenu() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items.current.filter((item): item is HTMLElement => item !== null);
    const index = list.findIndex((item) => item === document.activeElement);
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(list.length - 1);
        break;
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={`Account menu for ${user.email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((o) => !o);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-canvas transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-highlight focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none"
      >
        <span aria-hidden="true">{initialsOf(user.email)}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-elevated p-1.5 shadow-xl"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2" role="presentation">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-canvas"
            >
              {initialsOf(user.email)}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-ink-subtle">Signed in as</span>
              <span className="block truncate text-sm text-ink">{user.email}</span>
            </span>
          </div>
          <div className="my-1 h-px bg-line" role="separator" />
          <Link
            ref={(element) => {
              items.current[0] = element;
            }}
            href="/settings"
            role="menuitem"
            tabIndex={-1}
            className={itemClass}
            onClick={() => {
              close(false);
            }}
          >
            <GearIcon className="h-4 w-4" />
            Settings
          </Link>
          <button
            ref={(element) => {
              items.current[1] = element;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={itemClass}
            onClick={() => {
              close(false);
              void signOut();
            }}
          >
            <LogOutIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
