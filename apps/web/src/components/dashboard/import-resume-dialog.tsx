'use client';

import { DEFAULT_SECTION_TITLES, type ResumeContent } from '@pypr/resume-core';
import {
  IDEMPOTENCY_KEY_HEADER,
  RESUME_IMPORT_ERROR_CODES,
  RESUME_IMPORT_MAX_BYTES,
  resumeDocumentSchema,
  resumeImportResponseSchema,
} from '@pypr/validation';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { UploadIcon } from '@/components/icons';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ApiError, apiRequest, apiUpload } from '@/lib/api';
import { cn } from '@/lib/cn';

type Step =
  | { name: 'pick'; error?: string }
  | { name: 'reading'; fileName: string }
  | { name: 'review'; content: ResumeContent; warnings: string[]; key: string }
  | { name: 'creating'; content: ResumeContent; warnings: string[]; key: string };

const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Quick check before uploading; the server checks again by file content. */
function precheck(file: File): string | null {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Choose a PDF or Word (.docx) file.';
  if (file.size > RESUME_IMPORT_MAX_BYTES) return 'The file is larger than 5 MB.';
  if (file.size === 0) return 'This file is empty.';
  return null;
}

function defaultTitle(content: ResumeContent, fileName: string): string {
  const name = content.basics.fullName.trim();
  return (
    (name ? `${name} resume` : fileName.replace(/\.(pdf|docx)$/i, '')).slice(0, 120) ||
    'Imported resume'
  );
}

/**
 * Import: pick a file -> the server reads it and returns resume content (nothing saved) ->
 * the user reviews and names it -> the resume is created with the normal create endpoint and
 * opened in the editor. Cancelling at any point creates nothing. Mounted fresh on each open.
 */
export function ImportResumeDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function close() {
    abort.current?.abort();
    onClose();
  }

  async function read(file: File) {
    const problem = precheck(file);
    if (problem) {
      setStep({ name: 'pick', error: problem });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStep({ name: 'reading', fileName: file.name });
    const form = new FormData();
    form.append('file', file);
    try {
      const result = resumeImportResponseSchema.parse(
        await apiUpload('/api/resume-imports', form, controller.signal),
      );
      setTitle(defaultTitle(result.content, file.name));
      setStep({
        name: 'review',
        content: result.content,
        warnings: result.warnings,
        key: crypto.randomUUID(),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      let message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      if (error instanceof ApiError && error.code === RESUME_IMPORT_ERROR_CODES.busy) {
        message = 'The import service is busy right now. Wait a minute and try again.';
      }
      setStep({ name: 'pick', error: message });
    }
  }

  async function create() {
    if (step.name !== 'review') return;
    const trimmed = title.trim();
    if (!trimmed) {
      setCreateError('Give the resume a name.');
      return;
    }
    setCreateError(null);
    setStep({ ...step, name: 'creating' });
    try {
      const doc = resumeDocumentSchema.parse(
        await apiRequest('/api/resumes', {
          method: 'POST',
          body: { title: trimmed, content: step.content },
          headers: { [IDEMPOTENCY_KEY_HEADER]: step.key },
        }),
      );
      router.push(`/resumes/${doc.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the resume.');
      setStep({ ...step, name: 'review' });
    }
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void read(file);
  };

  return (
    <Dialog
      open
      wide
      onClose={close}
      title="Import a resume"
      description="Upload your current resume and we'll turn it into an editable Pypr resume."
    >
      {step.name === 'pick' && (
        <div className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => {
              setDragging(false);
            }}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              'has-focus-visible:ring-2 has-focus-visible:ring-highlight',
              dragging ? 'border-ink/50 bg-ink/[0.04]' : 'border-line hover:border-ink/30',
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-line bg-canvas text-ink-muted">
              <UploadIcon className="size-5" />
            </span>
            <span className="text-sm font-medium">Choose a file or drop it here</span>
            <span className="text-xs text-ink-subtle">PDF or Word (.docx), up to 5 MB</span>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void read(file);
              }}
            />
          </label>
          {step.error && <Alert tone="error">{step.error}</Alert>}
          <p className="text-xs leading-relaxed text-ink-subtle">
            We read the file once to fill in your resume, using an AI model. The file itself
            isn&apos;t stored. Scanned documents can&apos;t be read; use a PDF exported from your
            editor or a .docx file.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step.name === 'reading' && (
        <div className="space-y-5" aria-live="polite">
          <div className="flex items-center gap-3 rounded-xl border border-line p-4">
            <span
              className="size-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">Reading your resume…</p>
              <p className="truncate text-xs text-ink-subtle">
                {step.fileName} · this can take up to a minute
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(step.name === 'review' || step.name === 'creating') && (
        <div className="space-y-4">
          <Field
            label="Resume name"
            value={title}
            maxLength={120}
            error={createError ?? undefined}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
          <div className="rounded-xl border border-line p-4">
            <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">
              What we found
            </p>
            <p className="mt-2 font-medium">{step.content.basics.fullName || 'No name found'}</p>
            {step.content.basics.headline && (
              <p className="text-sm text-ink-muted">{step.content.basics.headline}</p>
            )}
            {(step.content.basics.email || step.content.basics.phone) && (
              <p className="text-sm text-ink-muted">
                {[step.content.basics.email, step.content.basics.phone].filter(Boolean).join(' · ')}
              </p>
            )}
            <ul className="mt-3 space-y-1 text-sm">
              {step.content.sections.map((section) => (
                <li key={section.id} className="flex justify-between gap-4">
                  <span>{section.title || DEFAULT_SECTION_TITLES[section.type]}</span>
                  <span className="text-ink-subtle">
                    {section.entries.length} {section.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </li>
              ))}
              {step.content.sections.length === 0 && (
                <li className="text-ink-subtle">No sections found</li>
              )}
            </ul>
          </div>
          {step.warnings.length > 0 && (
            <Alert>
              <ul className="list-disc space-y-1 pl-4">
                {step.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
          <p className="text-xs text-ink-subtle">
            AI can make mistakes. You can fix everything in the editor after creating the resume.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              disabled={step.name === 'creating'}
              onClick={() => {
                setStep({ name: 'pick' });
              }}
            >
              Choose another file
            </Button>
            <Button variant="secondary" onClick={close} disabled={step.name === 'creating'}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={step.name === 'creating'}>
              {step.name === 'creating' ? 'Creating…' : 'Create resume'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
