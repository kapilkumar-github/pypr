'use client';

import { useState } from 'react';
import { DownloadIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { apiDownload } from '@/lib/api';

/** Saves pending edits, then downloads the PDF the server renders from the saved resume. */
export function DownloadButton({
  resumeId,
  beforeDownload,
}: {
  resumeId: string;
  /** Resolves true when the server has the latest content. */
  beforeDownload: () => Promise<boolean>;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function download() {
    setState('working');
    try {
      if (!(await beforeDownload())) {
        setMessage('Fix the highlighted fields first, so the PDF matches your edits.');
        setState('error');
        return;
      }
      const { blob, fileName } = await apiDownload(`/api/resumes/${resumeId}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
      setState('idle');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not download the PDF.');
      setState('error');
    }
  }

  return (
    <div className="relative">
      <Button size="sm" onClick={() => void download()} disabled={state === 'working'}>
        <DownloadIcon className="h-4 w-4" />
        <span className="hidden sm:inline">
          {state === 'working' ? 'Preparing…' : 'Download PDF'}
        </span>
      </Button>
      {state === 'error' && (
        <p
          role="alert"
          className="absolute top-full right-0 z-30 mt-2 w-64 rounded-lg border border-danger/40 bg-surface p-3 text-xs shadow-lg"
        >
          {message}{' '}
          <button
            className="underline"
            onClick={() => {
              setState('idle');
            }}
          >
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
