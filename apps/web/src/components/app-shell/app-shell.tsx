'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MenuIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-state';
import { HeaderSlotContext } from './header-slot';
import { ProfileMenu } from './profile-menu';
import { SidebarContent } from './sidebar';

/**
 * Signed-in layout: a full-height sidebar on the left (collapsible on desktop, a drawer on
 * small screens) and the page on the right, under a minimal header with the account menu.
 * Only the main area scrolls.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  // The resume editor is a focused workspace: no sidebar there (it has Back to resumes).
  const focused = pathname.startsWith('/resumes/');
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);

  // The drawer is a native modal <dialog>: focus trap, Escape and inert page come for free.
  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  // Close the drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <aside
        aria-label="Sidebar"
        className={cn(
          'hidden shrink-0 border-r border-line bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none',
          collapsed ? 'w-16' : 'w-64',
          !focused && 'md:block',
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggle={() => {
            setSidebarCollapsed(!collapsed);
          }}
        />
      </aside>

      <dialog
        ref={drawer}
        aria-label="Menu"
        onClose={() => {
          setDrawerOpen(false);
          menuButton.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === drawer.current) setDrawerOpen(false); // backdrop
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-line bg-sidebar p-0 text-ink backdrop:bg-black/50 md:hidden"
      >
        <SidebarContent
          collapsed={false}
          onClose={() => {
            setDrawerOpen(false);
          }}
          onNavigate={() => {
            setDrawerOpen(false);
          }}
        />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4">
          <button
            ref={menuButton}
            type="button"
            onClick={() => {
              setDrawerOpen(true);
            }}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none md:hidden',
              focused && 'hidden',
            )}
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div ref={setHeaderSlot} className="flex min-w-0 flex-1 items-center gap-2" />
          <div className="shrink-0">
            <ProfileMenu />
          </div>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <HeaderSlotContext.Provider value={headerSlot}>{children}</HeaderSlotContext.Provider>
        </main>
      </div>
    </div>
  );
}
