import type { ReactNode } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';

/** Settings workspace: categories on the left, the selected one on the right. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-6 grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
        <aside className="border-b border-line pb-3 md:border-r md:border-b-0 md:pr-4 md:pb-0">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
