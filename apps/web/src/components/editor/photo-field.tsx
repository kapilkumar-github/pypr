'use client';

import { resumePhotoResponseSchema, type ResumePhoto } from '@pypr/validation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { TrashIcon, UploadIcon, UserIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { apiRequest, apiUpload } from '@/lib/api';
import { PHOTO_ACCEPT, checkPhotoFile, fetchResumePhoto } from '@/lib/photo';

export interface ResumePhotoState {
  /** The photo as a data: URI for the field and the preview; null when there is none. */
  src: string | null;
  busy: 'loading' | 'uploading' | 'removing' | null;
  error: string | null;
  upload: (file: File) => Promise<void>;
  remove: () => Promise<void>;
}

/**
 * The resume's photo (decision D28). It's saved by its own requests, separate from the content
 * autosave, so a failed upload never touches the user's other edits.
 */
export function useResumePhoto(resumeId: string, initial: ResumePhoto | null): ResumePhotoState {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<ResumePhotoState['busy']>(initial ? 'loading' : null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest action may update the state (a slow upload can't undo a later remove).
  const latest = useRef(0);
  const hasInitial = initial !== null;

  // Loads the stored photo once; later changes come from upload and remove.
  useEffect(() => {
    if (!hasInitial) return;
    const run = ++latest.current;
    fetchResumePhoto(resumeId).then(
      (dataUrl) => {
        if (run !== latest.current) return;
        setSrc(dataUrl);
        setBusy(null);
      },
      () => {
        if (run !== latest.current) return;
        setError("Your photo couldn't be loaded. Reload the page to try again.");
        setBusy(null);
      },
    );
  }, [resumeId, hasInitial]);

  const upload = useCallback(
    async (file: File) => {
      const problem = checkPhotoFile(file);
      if (problem) {
        setError(problem);
        return;
      }
      const run = ++latest.current;
      setBusy('uploading');
      setError(null);
      try {
        const form = new FormData();
        form.append('photo', file);
        resumePhotoResponseSchema.parse(
          await apiUpload(`/api/resumes/${resumeId}/photo`, form, undefined, 'PUT'),
        );
        // Show what the server stored (resized and upright), as the PDF will.
        const dataUrl = await fetchResumePhoto(resumeId);
        if (run === latest.current) setSrc(dataUrl);
      } catch (err) {
        if (run === latest.current) {
          setError(err instanceof Error ? err.message : "The photo couldn't be uploaded.");
        }
      } finally {
        if (run === latest.current) setBusy(null);
      }
    },
    [resumeId],
  );

  const remove = useCallback(async () => {
    const run = ++latest.current;
    setBusy('removing');
    setError(null);
    try {
      await apiRequest(`/api/resumes/${resumeId}/photo`, { method: 'DELETE' });
      if (run === latest.current) setSrc(null);
    } catch (err) {
      if (run === latest.current) {
        setError(err instanceof Error ? err.message : "The photo couldn't be removed.");
      }
    } finally {
      if (run === latest.current) setBusy(null);
    }
  }, [resumeId]);

  return { src, busy, error, upload, remove };
}

const busyLabel = { loading: 'Loading…', uploading: 'Uploading…', removing: 'Removing…' };

export function PhotoField({ photo, name }: { photo: ResumePhotoState; name: string }) {
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex items-center gap-4 sm:col-span-2">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-line bg-secondary">
        {photo.src ? (
          // A data: URI of the stored photo; next/image can't optimise those.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.src}
            alt="Your resume photo"
            className="h-full w-full object-cover object-[50%_30%]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-lg font-semibold text-ink-subtle"
          >
            {initials || <UserIcon className="h-6 w-6" />}
          </span>
        )}
        {photo.busy && (
          <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-canvas/60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Photo <span className="font-normal text-ink-subtle">(optional)</span>
        </p>
        <p id={hintId} className="mt-0.5 text-xs text-ink-subtle">
          JPEG, PNG or WebP, up to 5 MB. Shown cropped to a circle.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={PHOTO_ACCEPT}
            className="sr-only"
            aria-label="Choose a photo"
            aria-describedby={hintId}
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ''; // choosing the same file again still fires
              if (file) void photo.upload(file);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={photo.busy !== null}
            onClick={() => input.current?.click()}
          >
            <UploadIcon className="h-4 w-4" />
            {photo.src ? 'Replace photo' : 'Upload photo'}
          </Button>
          {photo.src && (
            <Button
              variant="ghost"
              size="sm"
              disabled={photo.busy !== null}
              onClick={() => void photo.remove()}
            >
              <TrashIcon className="h-4 w-4" />
              Remove
            </Button>
          )}
          <span className="text-xs text-ink-subtle" aria-live="polite">
            {photo.busy ? busyLabel[photo.busy] : ''}
          </span>
        </div>
        {photo.error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {photo.error}
          </p>
        )}
      </div>
    </div>
  );
}
