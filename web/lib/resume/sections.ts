import { newId } from "./ids"
import type {
  CustomItem,
  CustomSectionId,
  ListSectionId,
  ResumeData,
  SectionId,
  SectionMeta,
} from "./types"

/** Entry shape shared by every list section; fields beyond id/hidden depend on the section. */
export type AnyEntry = { id: string; hidden?: boolean } & Record<string, unknown>

type SectionInfo = {
  name: string
  /** One entry, for "Add …" buttons. */
  singular: string
  /** Sidebar is the default column in two-column templates. */
  side: boolean
  /** Can be removed from the resume (core sections are only hidden). */
  optional: boolean
  blank: () => AnyEntry
}

export const SECTION_INFO: Record<ListSectionId | "summary", SectionInfo> = {
  summary: { name: "Summary", singular: "summary", side: false, optional: false, blank: () => ({ id: newId() }) },
  experience: {
    name: "Experience",
    singular: "experience",
    side: false,
    optional: false,
    blank: () => ({ id: newId(), position: "", company: "", location: "", startDate: "", endDate: "", current: false, url: "", description: null }),
  },
  projects: {
    name: "Projects",
    singular: "project",
    side: false,
    optional: false,
    blank: () => ({ id: newId(), name: "", role: "", url: "", startDate: "", endDate: "", description: null }),
  },
  skills: { name: "Skills", singular: "skill group", side: true, optional: false, blank: () => ({ id: newId(), name: "", skills: "" }) },
  education: {
    name: "Education",
    singular: "education",
    side: false,
    optional: false,
    blank: () => ({ id: newId(), institution: "", degree: "", field: "", location: "", startDate: "", endDate: "", gpa: "", honors: "" }),
  },
  certifications: {
    name: "Certifications",
    singular: "certification",
    side: true,
    optional: true,
    blank: () => ({ id: newId(), name: "", issuer: "", date: "", url: "" }),
  },
  languages: { name: "Languages", singular: "language", side: true, optional: true, blank: () => ({ id: newId(), name: "", level: "" }) },
  interests: { name: "Interests", singular: "interest", side: true, optional: true, blank: () => ({ id: newId(), name: "", keywords: "" }) },
  awards: {
    name: "Awards",
    singular: "award",
    side: false,
    optional: true,
    blank: () => ({ id: newId(), title: "", awarder: "", date: "", description: null }),
  },
  publications: {
    name: "Publications",
    singular: "publication",
    side: false,
    optional: true,
    blank: () => ({ id: newId(), name: "", publisher: "", date: "", url: "", description: null }),
  },
  volunteer: {
    name: "Volunteering",
    singular: "role",
    side: false,
    optional: true,
    blank: () => ({ id: newId(), organization: "", position: "", location: "", startDate: "", endDate: "", description: null }),
  },
  references: {
    name: "References",
    singular: "reference",
    side: false,
    optional: true,
    blank: () => ({ id: newId(), name: "", relationship: "", contact: "", description: null }),
  },
}

export const blankCustomItem = (): CustomItem => ({ id: newId(), title: "", subtitle: "", date: "", url: "", description: null })

/** Sections every resume starts with, in print order. */
export const CORE_SECTIONS: SectionId[] = ["summary", "experience", "projects", "skills", "education", "certifications"]

/** Sections the "Add section" menu offers. */
export const ADDABLE_SECTIONS: ListSectionId[] = [
  "languages",
  "interests",
  "awards",
  "certifications",
  "publications",
  "volunteer",
  "references",
]

export const isCustom = (id: SectionId): id is CustomSectionId => id.startsWith("custom:")

export function sectionMeta(id: SectionId, patch: Partial<SectionMeta> = {}): SectionMeta {
  const side = !isCustom(id) && SECTION_INFO[id].side
  return { id, title: "", hidden: false, hideHeading: false, pageBreak: false, columns: 1, column: side ? "side" : "main", ...patch }
}

export function sectionTitle(meta: SectionMeta) {
  return meta.title.trim() || (isCustom(meta.id) ? "Custom section" : SECTION_INFO[meta.id].name)
}

/** The entries of a list or custom section (summary has none). */
export function sectionEntries(data: ResumeData, id: SectionId): AnyEntry[] {
  if (id === "summary") return []
  if (isCustom(id)) return (data.customSections.find((c) => `custom:${c.id}` === id)?.items ?? []) as unknown as AnyEntry[]
  return data[id] as unknown as AnyEntry[]
}

export function withSectionEntries(data: ResumeData, id: SectionId, entries: AnyEntry[]): ResumeData {
  if (id === "summary") return data
  if (isCustom(id)) {
    return {
      ...data,
      customSections: data.customSections.map((c) =>
        `custom:${c.id}` === id ? { ...c, items: entries as unknown as CustomItem[] } : c,
      ),
    }
  }
  return { ...data, [id]: entries }
}

export function blankEntry(id: SectionId): AnyEntry {
  return isCustom(id) ? (blankCustomItem() as unknown as AnyEntry) : SECTION_INFO[id].blank()
}

export function singularName(id: SectionId) {
  return isCustom(id) ? "entry" : SECTION_INFO[id].singular
}
