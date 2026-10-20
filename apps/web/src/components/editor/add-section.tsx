'use client';

import {
  DEFAULT_SECTION_TITLES,
  SECTION_TYPES,
  canAddSection,
  type ResumeContent,
  type SectionType,
} from '@pypr/resume-core';
import { useId, type ComponentType, type SVGProps } from 'react';
import {
  AwardIcon,
  BriefcaseIcon,
  CheckIcon,
  FolderIcon,
  GlobeIcon,
  GraduationCapIcon,
  LinkIcon,
  PlusIcon,
  SquarePlusIcon,
  TrophyIcon,
  WrenchIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

const ICONS: Record<SectionType, ComponentType<SVGProps<SVGSVGElement>>> = {
  experience: BriefcaseIcon,
  education: GraduationCapIcon,
  skills: WrenchIcon,
  projects: FolderIcon,
  certifications: AwardIcon,
  awards: TrophyIcon,
  languages: GlobeIcon,
  links: LinkIcon,
  custom: SquarePlusIcon,
};

export function sectionTypeLabel(type: SectionType): string {
  return type === 'custom' ? 'Custom section' : DEFAULT_SECTION_TITLES[type];
}

/**
 * Add section: one button per section type in two columns. A standard type that's already on
 * the resume shows "Added" and is disabled until that section is removed; custom sections can be
 * added any number of times. New sections go to the end (addSection in resume-core).
 */
export function AddSection({
  content,
  onAdd,
}: {
  content: ResumeContent;
  onAdd: (type: SectionType) => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-dashed border-line p-3 sm:p-4"
    >
      <h2 id={headingId} className="px-1 text-sm font-medium text-ink-muted">
        Add a section
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {SECTION_TYPES.map((type) => {
          const Icon = ICONS[type];
          const label = sectionTypeLabel(type);
          const added = !canAddSection(content, type);
          const custom = type === 'custom';
          return (
            <button
              key={type}
              type="button"
              disabled={added}
              aria-label={added ? `${label} (already added)` : `Add ${label}`}
              onClick={() => {
                onAdd(type);
              }}
              className={cn(
                'group flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left text-sm transition sm:gap-2.5 sm:px-3',
                'hover:border-ink/25 hover:bg-ink/[0.03] focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:bg-transparent disabled:text-ink-subtle disabled:hover:border-line',
                custom && 'col-span-2',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-ink-subtle group-enabled:group-hover:text-ink" />
              <span className="min-w-0 flex-1 leading-tight break-words">
                {label}
                {custom && (
                  <span className="ml-1.5 hidden text-xs text-ink-subtle sm:inline">
                    add as many as you need
                  </span>
                )}
              </span>
              {/* On phones only the check mark; the button's name still says "already added". */}
              {added ? (
                <span className="flex shrink-0 items-center gap-1 text-xs">
                  <CheckIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Added</span>
                </span>
              ) : (
                <PlusIcon className="hidden h-3.5 w-3.5 shrink-0 text-ink-subtle group-hover:text-ink sm:block" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
