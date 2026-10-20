import type { Metadata } from 'next';
import { ResumeEditor } from '@/components/editor/resume-editor';

export const metadata: Metadata = { title: 'Edit resume' };

export default async function ResumePage({ params }: PageProps<'/resumes/[id]'>) {
  const { id } = await params;
  return <ResumeEditor id={id} />;
}
