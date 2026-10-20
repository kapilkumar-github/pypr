'use client';

import {
  IDEMPOTENCY_KEY_HEADER,
  createResumeRequestSchema,
  resumeDocumentSchema,
  resumeListResponseSchema,
  type ResumeSummary,
} from '@pypr/validation';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { PlusIcon, UploadIcon } from '@/components/icons';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { apiGet, apiRequest } from '@/lib/api';
import { ImportResumeDialog } from './import-resume-dialog';
import { ResumeCard } from './resume-card';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; resumes: ResumeSummary[] };

export function Dashboard() {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<ResumeSummary | null>(null);

  const fetchList = useCallback(
    () =>
      apiGet('/api/resumes', resumeListResponseSchema).then(
        ({ resumes }): ListState => ({ status: 'ready', resumes }),
        (error: unknown): ListState => ({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load your resumes.',
        }),
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchList().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const reload = () => {
    setState({ status: 'loading' });
    void fetchList().then(setState);
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your resumes</h1>
          <p className="mt-1 text-sm text-ink-muted">Edit one, start a new one, or import yours.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <PlusIcon className="size-4" />
            New resume
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setImporting(true);
            }}
          >
            <UploadIcon className="size-4" />
            Import resume
          </Button>
        </div>
      </div>

      <div className="mt-8">
        {state.status === 'loading' && <p className="text-sm text-ink-subtle">Loading…</p>}
        {state.status === 'error' && (
          <Alert tone="error">
            {state.message}{' '}
            <button className="underline" onClick={reload}>
              Try again
            </button>
          </Alert>
        )}
        {state.status === 'ready' && state.resumes.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
            <p className="font-medium">No resumes yet</p>
            <p className="mt-1 text-sm text-ink-muted">
              Start from scratch, or import the resume you already have.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setCreating(true);
                }}
              >
                <PlusIcon className="size-4" />
                Create a resume
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setImporting(true);
                }}
              >
                <UploadIcon className="size-4" />
                Import resume
              </Button>
            </div>
          </div>
        )}
        {state.status === 'ready' && state.resumes.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,500px),1fr))] gap-6">
            {state.resumes.map((resume) => (
              <li key={resume.id}>
                <ResumeCard resume={resume} onDelete={setDeleting} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {importing && (
        <ImportResumeDialog
          onClose={() => {
            setImporting(false);
          }}
        />
      )}
      {creating && (
        <CreateResumeDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      )}
      <DeleteResumeDialog
        resume={deleting}
        onClose={() => {
          setDeleting(null);
        }}
        onDeleted={(id) => {
          setState((s) =>
            s.status === 'ready' ? { ...s, resumes: s.resumes.filter((r) => r.id !== id) } : s,
          );
        }}
      />
    </main>
  );
}

/** Mounted fresh each time it opens, so its state (and idempotency key) starts clean. */
function CreateResumeDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('My resume');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per opening: retrying a failed submit can't create two resumes.
  const [key] = useState(() => crypto.randomUUID());

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createResumeRequestSchema.safeParse({ title });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the name.');
      return;
    }
    setBusy(true);
    try {
      const doc = resumeDocumentSchema.parse(
        await apiRequest('/api/resumes', {
          method: 'POST',
          body: parsed.data,
          headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        }),
      );
      router.push(`/resumes/${doc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the resume.');
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="New resume" description="You can rename it later.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Field
          label="Name"
          value={title}
          maxLength={120}
          required
          error={error ?? undefined}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteResumeDialog({
  resume,
  onClose,
  onDeleted,
}: {
  resume: ResumeSummary | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!resume) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/resumes/${resume.id}`, { method: 'DELETE' });
      onDeleted(resume.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the resume.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={resume !== null}
      onClose={onClose}
      title="Delete this resume?"
      description={`"${resume?.title || 'Untitled resume'}" will be deleted for good.`}
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Dialog>
  );
}
