import { redirect } from 'next/navigation';

/** /settings opens the first category. */
export default function SettingsPage() {
  redirect('/settings/appearance');
}
