import type { Metadata } from 'next';
import { ThemeSwitcher } from '@/components/settings/theme-switcher';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-ink-muted">Choose how Pypr looks on this device.</p>

      <section aria-labelledby="appearance-heading" className="mt-10 border-t border-line pt-8">
        <h2 id="appearance-heading" className="text-lg font-semibold">
          Appearance
        </h2>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          Until you choose, Pypr follows your device&apos;s light or dark setting.
        </p>
        <ThemeSwitcher />
      </section>
    </div>
  );
}
