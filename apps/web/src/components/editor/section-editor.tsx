'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DEFAULT_SECTION_TITLES, type EntryData, type ResumeSection } from '@pypr/resume-core';
import { useId, useState } from 'react';
import {
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { EntryEditor } from './entry-editor';
import { IconButton } from './icon-button';

export interface SectionActions {
  rename: (title: string) => void;
  toggleVisible: () => void;
  remove: () => void;
  addEntry: () => void;
  updateEntry: (entryId: string, patch: Partial<EntryData>) => void;
  moveEntry: (entryId: string, toIndex: number) => void;
  toggleEntry: (entryId: string) => void;
  removeEntry: (entryId: string) => void;
}

/**
 * One resume section as an accordion item. The grip handle reorders sections by drag and drop
 * (or keyboard: focus it, Space to pick up, arrow keys to move, Space to drop); only the handle
 * starts a drag, so typing in fields never does.
 */
export function SectionEditor({
  section,
  expanded,
  onToggleExpanded,
  errors,
  actions,
}: {
  section: ResumeSection;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Validation messages keyed by "<entryId>.<field>" or "title". */
  errors: Map<string, string>;
  actions: SectionActions;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const panelId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });
  const title = section.title.trim() || DEFAULT_SECTION_TITLES[section.type];
  const hasErrors = errors.size > 0;
  const open = expanded || hasErrors;

  const entryErrors = (entryId: string) => {
    const map = new Map<string, string>();
    for (const [key, message] of errors) {
      if (key.startsWith(`${entryId}.`)) map.set(key.slice(entryId.length + 1), message);
    }
    return map;
  };

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition,
      }}
      aria-label={title}
      data-section-id={section.id}
      className={cn(
        'rounded-xl border border-line bg-surface',
        !section.visible && 'opacity-70',
        isDragging && 'relative z-10 shadow-2xl ring-2 ring-highlight/60',
      )}
    >
      <div className="flex items-center gap-1 py-1.5 pr-2 pl-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${title}`}
          title="Drag to reorder"
          className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-subtle hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none active:cursor-grabbing"
        >
          <GripVerticalIcon className="h-4 w-4" />
        </button>
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggleExpanded}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
          >
            <ChevronDownIcon
              className={cn(
                'h-4 w-4 shrink-0 text-ink-subtle transition-transform',
                !open && '-rotate-90',
              )}
            />
            <span className="truncate text-base font-semibold">{title}</span>
            <span className="shrink-0 text-xs font-normal text-ink-subtle">
              {section.entries.length} {section.entries.length === 1 ? 'entry' : 'entries'}
            </span>
            {hasErrors && (
              <span className="shrink-0 text-xs font-normal text-danger">Needs a fix</span>
            )}
          </button>
        </h2>
        <IconButton
          label={section.visible ? `Hide ${title} from resume` : `Show ${title} on resume`}
          onClick={actions.toggleVisible}
        >
          {section.visible ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
        </IconButton>
        <IconButton
          label={`Delete ${title}`}
          onClick={() => {
            setConfirmingDelete(true);
          }}
        >
          <TrashIcon className="h-4 w-4" />
        </IconButton>
      </div>

      {confirmingDelete && (
        <div
          role="alert"
          className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm"
        >
          <span className="flex-1">
            Delete this section and its {section.entries.length}{' '}
            {section.entries.length === 1 ? 'entry' : 'entries'}?
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setConfirmingDelete(false);
            }}
          >
            Keep
          </Button>
          <Button size="sm" variant="danger" onClick={actions.remove}>
            Delete
          </Button>
        </div>
      )}

      <div id={panelId} hidden={!open} className="border-t border-line px-4 pt-4 pb-3">
        <Field
          label="Section title"
          value={section.title}
          placeholder={DEFAULT_SECTION_TITLES[section.type]}
          maxLength={80}
          error={errors.get('title')}
          onChange={(e) => {
            actions.rename(e.target.value);
          }}
        />
        <div className="mt-4 space-y-2">
          {section.entries.map((entry, i) => (
            <EntryEditor
              key={entry.id}
              type={section.type}
              entry={entry}
              index={i}
              count={section.entries.length}
              errors={entryErrors(entry.id)}
              onChange={(patch) => {
                actions.updateEntry(entry.id, patch);
              }}
              onMove={(to) => {
                actions.moveEntry(entry.id, to);
              }}
              onToggleVisible={() => {
                actions.toggleEntry(entry.id);
              }}
              onRemove={() => {
                actions.removeEntry(entry.id);
              }}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-3" onClick={actions.addEntry}>
          <PlusIcon className="h-4 w-4" />
          Add {section.entries.length === 0 ? 'an entry' : 'another'}
        </Button>
      </div>
    </section>
  );
}
