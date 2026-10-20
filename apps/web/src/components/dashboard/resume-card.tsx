'use client';

import type { ResumeSummary } from '@pypr/validation';
import Link from 'next/link';
import { useState } from 'react';
import { DownloadIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { apiDownload } from '@/lib/api';

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
};

/** The thumbnail's sketch of a page (from the legacy pypr-ui card). */
function PageSketch() {
  const line = 'rounded-sm bg-ink/15';
  const heading = 'rounded-sm bg-accent/40';
  return (
    <div className="absolute inset-0 p-5" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-2.5 w-2/5 rounded-sm bg-ink/40" />
        <div className={`h-1.5 w-3/5 ${line}`} />
      </div>
      <div className="mt-7 space-y-1.5">
        <div className={`h-1.5 w-1/3 ${heading}`} />
        <div className={`h-1 w-full ${line}`} />
        <div className={`h-1 w-11/12 ${line}`} />
        <div className={`h-1 w-4/5 ${line}`} />
      </div>
      <div className="mt-6 space-y-1.5">
        <div className={`h-1.5 w-1/4 ${heading}`} />
        <div className={`h-1 w-full ${line}`} />
        <div className={`h-1 w-10/12 ${line}`} />
        <div className={`h-1 w-3/4 ${line}`} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[0, 1].map((item) => (
          <div className="space-y-1.5" key={item}>
            <div className={`h-1.5 w-1/2 ${heading}`} />
            <div className={`h-1 w-full ${line}`} />
            <div className={`h-1 w-4/5 ${line}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

const roundButton =
  'flex size-10 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-sm';

/**
 * Resume card, adapted from pypr-old's ResumeCard: page thumbnail (hover for Edit and Download)
 * on the left, name, dates and headline on the right. Download gives the PDF (the legacy card
 * downloaded JSON); Delete is kept from the current dashboard.
 */
export function ResumeCard({
  resume,
  onDelete,
}: {
  resume: ResumeSummary;
  onDelete: (resume: ResumeSummary) => void;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const name = resume.title || 'Untitled resume';

  async function download() {
    setDownloadError(null);
    setDownloading(true);
    try {
      const { blob, fileName } = await apiDownload(`/api/resumes/${resume.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download the PDF');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className="flex h-[240px] w-full min-w-0 overflow-hidden rounded-xl border border-line bg-surface transition-all duration-200 hover:border-ink/25 hover:shadow-lg sm:h-[300px]">
      <div className="group relative aspect-[3/4] h-full shrink-0 overflow-hidden border-r border-line bg-canvas">
        <Link
          href={`/resumes/${resume.id}`}
          aria-label={`Open ${name}`}
          className="absolute inset-0 focus-visible:outline-none"
        >
          <PageSketch />
        </Link>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-canvas/70 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
          <span aria-hidden="true" className={roundButton}>
            <PencilIcon className="size-4" />
          </span>
          <button
            type="button"
            aria-label={`Download ${name} as PDF`}
            title="Download PDF"
            disabled={downloading}
            onClick={() => void download()}
            className={`${roundButton} pointer-events-auto transition-all hover:scale-105 hover:bg-primary hover:text-primary-ink focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none disabled:opacity-60`}
          >
            <DownloadIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative flex min-w-0 flex-1 items-start justify-between gap-2 p-4 sm:gap-4 sm:p-6">
        <div className="flex min-w-0 flex-1 flex-col self-stretch">
          <h3 className="truncate text-lg font-semibold tracking-tight text-ink">
            {/* The link's click area covers the card body; its name is just the title. */}
            <Link
              href={`/resumes/${resume.id}`}
              className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
            >
              {name}
            </Link>
          </h3>
          <p className="mt-3 text-sm text-ink-muted">Modified on {formatDate(resume.updatedAt)}</p>
          <p className="mt-1 text-sm text-ink-muted">Created on {formatDate(resume.createdAt)}</p>
          {downloadError && (
            <p role="alert" className="relative mt-2 text-xs text-danger">
              {downloadError}
            </p>
          )}
          <span className="mt-auto truncate text-xs text-ink-subtle">
            {resume.headline || `${resume.template} template`}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Delete ${name}`}
          title="Delete"
          onClick={() => {
            onDelete(resume);
          }}
          className="relative z-10 -mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-ink-subtle transition hover:bg-ink/[0.06] hover:text-danger focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    </article>
  );
}
