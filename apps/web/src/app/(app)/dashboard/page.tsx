import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard/dashboard';

export const metadata: Metadata = { title: 'Your resumes' };

export default function DashboardPage() {
  return <Dashboard />;
}
