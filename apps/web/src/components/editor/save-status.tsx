import type { SaveStatus } from '@/lib/autosave';
import { cn } from '@/lib/cn';

const labels: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  invalid: 'Fix the highlighted fields to save',
  retrying: "Couldn't save. Retrying…",
  conflict: 'Not saved',
};

export function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const bad = status === 'invalid' || status === 'retrying' || status === 'conflict';
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        bad ? 'text-danger' : 'text-ink-subtle',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'saved' && 'bg-success',
          (status === 'pending' || status === 'saving') && 'animate-pulse bg-ink-subtle',
          bad && 'bg-danger',
        )}
      />
      {labels[status]}
    </span>
  );
}
