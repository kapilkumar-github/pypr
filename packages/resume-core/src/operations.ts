import { DEFAULT_SECTION_TITLES, emptyBasics, emptyEntryData } from './defaults.js';
import { DEFAULT_RESUME_SETTINGS, isStandardSectionType } from './schema.js';
import type {
  Basics,
  EntryData,
  ResumeContent,
  ResumeEntry,
  ResumeSection,
  SectionOf,
  SectionType,
} from './schema.js';

/**
 * Pure, immutable edits on resume content. Each returns a new object and leaves the input
 * untouched, so the editor can keep history and compare versions cheaply. Unknown ids leave
 * the content unchanged.
 */

export type NewId = () => string;
// Web Crypto is built into browsers and Node 19+; typed here because this package has no
// DOM or Node types.
const webCrypto = (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto;
const randomId: NewId = () => webCrypto.randomUUID();

/** Sections a new resume starts with. */
export const STARTER_SECTIONS: readonly SectionType[] = ['experience', 'education', 'skills'];

export function createResumeContent(
  options: { title: string; template: string },
  newId: NewId = randomId,
): ResumeContent {
  return {
    title: options.title,
    template: options.template,
    settings: { ...DEFAULT_RESUME_SETTINGS },
    basics: emptyBasics(),
    sections: STARTER_SECTIONS.map((type) => createSection(type, newId)),
  };
}

export function createSection<T extends SectionType>(
  type: T,
  newId: NewId = randomId,
): SectionOf<T> {
  const section = {
    id: newId(),
    type,
    title: DEFAULT_SECTION_TITLES[type],
    visible: true,
    entries: [],
  };
  return section as unknown as SectionOf<T>;
}

export function createEntry<T extends SectionType>(
  type: T,
  newId: NewId = randomId,
): ResumeEntry<T> {
  const entry = { id: newId(), visible: true, data: emptyEntryData(type) };
  return entry as unknown as ResumeEntry<T>;
}

export function updateBasics(content: ResumeContent, patch: Partial<Basics>): ResumeContent {
  return { ...content, basics: { ...content.basics, ...patch } };
}

export function updateResumeMeta(
  content: ResumeContent,
  patch: Partial<Pick<ResumeContent, 'title' | 'template'>>,
): ResumeContent {
  return { ...content, ...patch };
}

export function updateSettings(
  content: ResumeContent,
  patch: Partial<ResumeContent['settings']>,
): ResumeContent {
  return { ...content, settings: { ...content.settings, ...patch } };
}

/** Whether `type` can be added: custom always, a standard type only if it isn't there yet. */
export function canAddSection(content: ResumeContent, type: SectionType): boolean {
  return !isStandardSectionType(type) || content.sections.every((s) => s.type !== type);
}

/** Adds a section at the end. A standard type that already exists leaves the content unchanged. */
export function addSection(
  content: ResumeContent,
  type: SectionType,
  newId: NewId = randomId,
): ResumeContent {
  if (!canAddSection(content, type)) return content;
  return { ...content, sections: [...content.sections, createSection(type, newId)] };
}

export function removeSection(content: ResumeContent, sectionId: string): ResumeContent {
  return { ...content, sections: content.sections.filter((s) => s.id !== sectionId) };
}

export function updateSection(
  content: ResumeContent,
  sectionId: string,
  patch: Partial<Pick<ResumeSection, 'title' | 'visible'>>,
): ResumeContent {
  return mapSection(content, sectionId, (section) => ({ ...section, ...patch }));
}

/** Moves a section to `toIndex` (clamped to the list). */
export function moveSection(
  content: ResumeContent,
  sectionId: string,
  toIndex: number,
): ResumeContent {
  return { ...content, sections: moveItem(content.sections, sectionId, toIndex) };
}

export function addEntry(
  content: ResumeContent,
  sectionId: string,
  newId: NewId = randomId,
): ResumeContent {
  return mapSection(content, sectionId, (section) => ({
    ...section,
    entries: [...section.entries, createEntry(section.type, newId)],
  }));
}

export function removeEntry(
  content: ResumeContent,
  sectionId: string,
  entryId: string,
): ResumeContent {
  return mapSection(content, sectionId, (section) => ({
    ...section,
    entries: section.entries.filter((e) => e.id !== entryId),
  }));
}

/** Merges `patch` into an entry's data. The caller picks `T` to match the section's type. */
export function updateEntryData<T extends SectionType>(
  content: ResumeContent,
  sectionId: string,
  entryId: string,
  patch: Partial<EntryData<T>>,
): ResumeContent {
  return mapEntries(content, sectionId, entryId, (entry) => ({
    ...entry,
    data: { ...entry.data, ...patch },
  }));
}

export function setEntryVisible(
  content: ResumeContent,
  sectionId: string,
  entryId: string,
  visible: boolean,
): ResumeContent {
  return mapEntries(content, sectionId, entryId, (entry) => ({ ...entry, visible }));
}

export function moveEntry(
  content: ResumeContent,
  sectionId: string,
  entryId: string,
  toIndex: number,
): ResumeContent {
  return mapSection(content, sectionId, (section) => ({
    ...section,
    entries: moveItem(section.entries, entryId, toIndex),
  }));
}

// Helpers. The casts live only here: edits never change a section's type, so its entries
// keep matching it. resumeContentSchema re-checks this on every save.

interface LooseEntry {
  id: string;
  visible: boolean;
  data: EntryData;
}
type LooseSection = Omit<ResumeSection, 'entries'> & { entries: LooseEntry[] };

function mapSection(
  content: ResumeContent,
  sectionId: string,
  update: (section: LooseSection) => LooseSection,
): ResumeContent {
  const index = content.sections.findIndex((section) => section.id === sectionId);
  const section = content.sections[index];
  if (!section) return content;
  const sections = [...content.sections];
  sections[index] = update(section) as unknown as ResumeSection;
  return { ...content, sections };
}

function mapEntries(
  content: ResumeContent,
  sectionId: string,
  entryId: string,
  update: (entry: LooseEntry) => LooseEntry,
): ResumeContent {
  return mapSection(content, sectionId, (section) => ({
    ...section,
    entries: section.entries.map((entry) => (entry.id === entryId ? update(entry) : entry)),
  }));
}

function moveItem<T extends { id: string }>(items: readonly T[], id: string, toIndex: number): T[] {
  const from = items.findIndex((item) => item.id === id);
  if (from === -1) return [...items];
  const target = Math.max(0, Math.min(items.length - 1, Math.trunc(toIndex)));
  const result = [...items];
  const [item] = result.splice(from, 1);
  if (item) result.splice(target, 0, item);
  return result;
}
