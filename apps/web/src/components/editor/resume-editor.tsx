'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  DEFAULT_SECTION_TITLES,
  addEntry,
  addSection,
  moveEntry,
  moveSection,
  removeEntry,
  removeSection,
  setEntryVisible,
  updateBasics,
  updateEntryData,
  updateResumeMeta,
  updateSection,
  updateSettings,
  type ResumeContent,
} from '@pypr/resume-core';
import { RESUME_ERROR_CODES, resumeDocumentSchema, type ResumePhoto } from '@pypr/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AppHeaderSlot } from '@/components/app-shell/header-slot';
import { ArrowLeftIcon } from '@/components/icons';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { inputClass } from '@/components/ui/field';
import { ApiError, apiGet, apiRequest } from '@/lib/api';
import { Autosaver, ConflictError, type SaveStatus } from '@/lib/autosave';
import { cn } from '@/lib/cn';
import { BasicsEditor } from './basics-editor';
import { DownloadButton } from './download-button';
import { AddSection } from './add-section';
import { groupIssues } from './issues';
import { PhotoField, useResumePhoto } from './photo-field';
import { ResumePreview } from './resume-preview';
import { SaveStatusBadge } from './save-status';
import { SectionEditor, type SectionActions } from './section-editor';
import { TemplatesPanel } from './templates-panel';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; content: ResumeContent; revision: number; photo: ResumePhoto | null };

export function ResumeEditor({ id }: { id: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet(`/api/resumes/${id}`, resumeDocumentSchema).then(
      (doc) => {
        if (!cancelled) {
          setLoad({
            status: 'ready',
            content: doc.content,
            revision: doc.revision,
            photo: doc.photo,
          });
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        const notFound =
          error instanceof ApiError && (error.status === 404 || error.status === 400);
        setLoad({
          status: 'error',
          message: notFound
            ? "This resume doesn't exist, or it isn't yours."
            : error instanceof Error
              ? error.message
              : 'Could not load the resume.',
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (load.status === 'loading') {
    return <p className="p-8 text-center text-sm text-ink-subtle">Loading resume…</p>;
  }
  if (load.status === 'error') {
    return (
      <div className="mx-auto max-w-md p-8">
        <Alert tone="error">{load.message}</Alert>
        <Link href="/dashboard" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to your resumes
        </Link>
      </div>
    );
  }
  return (
    <Editor id={id} initial={load.content} revision={load.revision} initialPhoto={load.photo} />
  );
}

function Editor({
  id,
  initial,
  revision,
  initialPhoto,
}: {
  id: string;
  initial: ResumeContent;
  revision: number;
  initialPhoto: ResumePhoto | null;
}) {
  const router = useRouter();
  const photo = useResumePhoto(id, initialPhoto);
  const photoSrc = photo.src ?? undefined;
  const [content, setContent] = useState(initial);
  const contentRef = useRef(initial);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [tab, setTab] = useState<'form' | 'templates'>('form');
  /** Collapsed accordion items by id ("basics" or a section id); survives reordering. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** A section just added: scrolled into view and focused once it has rendered. */
  const revealSection = useRef<string | null>(null);

  useEffect(() => {
    const id = revealSection.current;
    if (!id) return;
    revealSection.current = null;
    const element = document.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(id)}"]`);
    if (!element) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    // Its header button, so keyboard users land in the new section (the Add button they pressed
    // may now be disabled).
    element.querySelector<HTMLElement>('button[aria-expanded]')?.focus({ preventScroll: true });
  }, [content]);
  const [saver] = useState(
    () =>
      new Autosaver({
        revision,
        onStatus: setStatus,
        save: async (next, rev, keepalive) => {
          try {
            const doc = resumeDocumentSchema.parse(
              await apiRequest(`/api/resumes/${id}`, {
                method: 'PUT',
                body: { revision: rev, content: next },
                keepalive,
              }),
            );
            return doc.revision;
          } catch (error) {
            if (error instanceof ApiError && error.code === RESUME_ERROR_CODES.revisionConflict) {
              throw new ConflictError(error.message);
            }
            throw error;
          }
        },
      }),
  );

  // Save when the tab is hidden or closed; warn before leaving with unsaved changes.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void saver.flush({ keepalive: true });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saver.hasUnsavedChanges) event.preventDefault();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void saver.flush(); // leaving the editor inside the app
      saver.dispose();
    };
  }, [saver]);

  const edit = useCallback(
    (change: (current: ResumeContent) => ResumeContent) => {
      const next = change(contentRef.current);
      if (next === contentRef.current) return;
      contentRef.current = next;
      setContent(next);
      saver.update(next);
    },
    [saver],
  );

  const issues = useMemo(() => groupIssues(content), [content]);

  const toggle = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Back to resumes: save first; if something can't be saved, ask instead of losing it. */
  const goBack = async () => {
    await saver.flush();
    if (saver.hasUnsavedChanges) setConfirmLeave(true);
    else router.push('/dashboard');
  };

  const sectionActions = (sectionId: string, visible: boolean): SectionActions => ({
    rename: (title) => {
      edit((c) => updateSection(c, sectionId, { title }));
    },
    toggleVisible: () => {
      edit((c) => updateSection(c, sectionId, { visible: !visible }));
    },
    remove: () => {
      edit((c) => removeSection(c, sectionId));
    },
    addEntry: () => {
      edit((c) => addEntry(c, sectionId));
    },
    updateEntry: (entryId, patch) => {
      edit((c) => updateEntryData(c, sectionId, entryId, patch));
    },
    moveEntry: (entryId, to) => {
      edit((c) => moveEntry(c, sectionId, entryId, to));
    },
    toggleEntry: (entryId) => {
      edit((c) => {
        const entry = c.sections
          .find((s) => s.id === sectionId)
          ?.entries.find((e) => e.id === entryId);
        return entry ? setEntryVisible(c, sectionId, entryId, !entry.visible) : c;
      });
    },
    removeEntry: (entryId) => {
      edit((c) => removeEntry(c, sectionId, entryId));
    },
  });

  return (
    // The editor uses the app's own accent; the resume's accent colors only the resume
    // (preview and PDF), so the two never affect each other (decision D28).
    <div className="flex h-full min-h-0 flex-col">
      <AppHeaderSlot>
        <div className="contents">
          <button
            type="button"
            onClick={() => void goBack()}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-sm text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Back to resumes</span>
            <span className="sr-only sm:hidden">Back to resumes</span>
          </button>
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
          <input
            aria-label="Resume name"
            value={content.title}
            maxLength={120}
            placeholder="Untitled resume"
            onChange={(e) => {
              const title = e.target.value;
              edit((c) => updateResumeMeta(c, { title }));
            }}
            className={cn(
              inputClass,
              'h-9 w-auto min-w-0 flex-1 border-transparent bg-transparent font-medium sm:max-w-xs',
            )}
          />
          <div className="ml-auto flex items-center gap-2">
            <div
              className="flex rounded-lg border border-line p-0.5 lg:hidden"
              role="group"
              aria-label="View"
            >
              {(['edit', 'preview'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs capitalize',
                    view === v ? 'bg-primary text-primary-ink' : 'text-ink-muted',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <DownloadButton
              resumeId={id}
              beforeDownload={async () => {
                await saver.flush();
                return !saver.hasUnsavedChanges;
              }}
            />
          </div>
        </div>
      </AppHeaderSlot>

      <div className="flex min-h-0 flex-1 border-t border-line">
        <div
          className={cn(
            'flex min-h-0 w-full flex-col border-line lg:w-[min(48rem,52%)] lg:shrink-0 lg:border-r',
            view === 'preview' && 'hidden lg:flex',
          )}
        >
          <EditorTabs tab={tab} onChange={setTab} status={status} />
          {status === 'conflict' && (
            <div className="px-4 pt-3 sm:px-6">
              <Alert tone="error">
                This resume was changed in another tab or device, so these edits weren&apos;t saved.{' '}
                <button
                  className="font-medium underline"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  Reload the latest version
                </button>
              </Alert>
            </div>
          )}
          <div
            id="editor-panel-form"
            role="tabpanel"
            aria-labelledby="editor-tab-form"
            hidden={tab !== 'form'}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6"
          >
            {issues.general.length > 0 && <Alert tone="error">{issues.general.join(' ')}</Alert>}
            <BasicsEditor
              basics={content.basics}
              errors={issues.basics}
              expanded={!collapsed.has('basics')}
              onToggleExpanded={() => {
                toggle('basics');
              }}
              onChange={(patch) => {
                edit((c) => updateBasics(c, patch));
              }}
              photo={<PhotoField photo={photo} name={content.basics.fullName} />}
            />
            <SortableSections
              content={content}
              onMove={(sectionId, to) => {
                edit((c) => moveSection(c, sectionId, to));
              }}
            >
              {content.sections.map((section) => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  expanded={!collapsed.has(section.id)}
                  onToggleExpanded={() => {
                    toggle(section.id);
                  }}
                  errors={issues.sections.get(section.id) ?? new Map<string, string>()}
                  actions={sectionActions(section.id, section.visible)}
                />
              ))}
            </SortableSections>
            <AddSection
              content={content}
              onAdd={(type) => {
                const before = contentRef.current;
                edit((c) => addSection(c, type));
                const added = contentRef.current.sections.at(-1);
                if (contentRef.current !== before && added) revealSection.current = added.id;
              }}
            />
          </div>
          <div
            id="editor-panel-templates"
            role="tabpanel"
            aria-labelledby="editor-tab-templates"
            hidden={tab !== 'templates'}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
          >
            <TemplatesPanel
              content={content}
              photo={photoSrc}
              onTemplate={(template) => {
                edit((c) => updateResumeMeta(c, { template }));
              }}
              onSettings={(patch) => {
                edit((c) => updateSettings(c, patch));
              }}
            />
          </div>
        </div>

        <div
          role="region"
          aria-label="Preview"
          // Focusable so keyboard users can scroll the preview.
          tabIndex={0}
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas p-4 focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none focus-visible:ring-inset sm:p-6',
            view === 'edit' && 'hidden lg:block',
          )}
        >
          <ResumePreview content={content} photo={photoSrc} />
        </div>
      </div>

      <Dialog
        open={confirmLeave}
        onClose={() => {
          setConfirmLeave(false);
        }}
        title="Leave without saving?"
        description={
          status === 'invalid'
            ? 'Some fields need a fix before your latest changes can be saved.'
            : "Your latest changes couldn't be saved yet."
        }
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setConfirmLeave(false);
            }}
          >
            Stay and fix
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmLeave(false);
              router.push('/dashboard');
            }}
          >
            Leave anyway
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

const TABS = [
  { id: 'form', label: 'Form' },
  { id: 'templates', label: 'Templates' },
] as const;

/** Form / Templates tabs: a WAI-ARIA tablist (arrow keys, Home, End). */
function EditorTabs({
  tab,
  onChange,
  status,
}: {
  tab: 'form' | 'templates';
  onChange: (tab: 'form' | 'templates') => void;
  status: SaveStatus;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const go = (i: number) => {
      const next = TABS[(i + TABS.length) % TABS.length];
      if (!next) return;
      onChange(next.id);
      document.getElementById(`editor-tab-${next.id}`)?.focus();
    };
    if (event.key === 'ArrowRight') go(index + 1);
    else if (event.key === 'ArrowLeft') go(index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(TABS.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6">
      <div role="tablist" aria-label="Editor" className="flex gap-1" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`editor-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`editor-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => {
              onChange(t.id);
            }}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none',
              tab === t.id
                ? 'border-highlight font-medium text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <span className="ml-auto">
        <SaveStatusBadge status={status} />
      </span>
    </div>
  );
}

/** Drag-and-drop ordering for sections (pointer and keyboard), with spoken announcements. */
function SortableSections({
  content,
  onMove,
  children,
}: {
  content: ResumeContent;
  onMove: (sectionId: string, toIndex: number) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    // A small move is needed before a drag starts, so clicks on the handle don't drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = content.sections.map((s) => s.id);
  const titleOf = (id: string | number) => {
    const section = content.sections.find((s) => s.id === id);
    return section ? section.title.trim() || DEFAULT_SECTION_TITLES[section.type] : 'Section';
  };
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(active.id)}. Position ${String(positionOf(active.id))} of ${String(ids.length)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} is over position ${String(positionOf(over.id))} of ${String(ids.length)}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} dropped at position ${String(positionOf(over.id))} of ${String(ids.length)}.`
        : `${titleOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onMove(String(active.id), ids.indexOf(String(over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To reorder a section, press Space or Enter to pick it up, use the arrow keys to move it, then press Space or Enter to drop it, or Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">{children}</div>
      </SortableContext>
    </DndContext>
  );
}
