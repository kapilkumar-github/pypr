import { formatMonth, formatRange } from "@/lib/resume/format"
import type { AnyEntry } from "@/lib/resume/sections"
import type { ListSectionId } from "@/lib/resume/types"

export type FieldDef = {
  key: string
  label: string
  kind: "text" | "month" | "url" | "rich" | "current"
  /** Takes half the row next to another half field. */
  half?: boolean
  placeholder?: string
  description?: string
}

type EntryDef = {
  fields: FieldDef[]
  /** Row label in the editor list. */
  title: (e: AnyEntry) => string
  subtitle: (e: AnyEntry) => string
}

const str = (v: unknown) => (typeof v === "string" ? v : "")
const join = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(" · ")
const range = (e: AnyEntry) => formatRange(str(e.startDate), str(e.endDate), e.current === true)

const dates: FieldDef[] = [
  { key: "startDate", label: "Start", kind: "month", half: true },
  { key: "endDate", label: "End", kind: "month", half: true },
]

export const ENTRY_DEFS: Record<ListSectionId | "custom", EntryDef> = {
  experience: {
    fields: [
      { key: "position", label: "Position", kind: "text", half: true, placeholder: "Senior Engineer" },
      { key: "company", label: "Company", kind: "text", half: true },
      { key: "location", label: "Location", kind: "text", placeholder: "City, or Remote" },
      ...dates,
      { key: "current", label: "I work here now", kind: "current" },
      { key: "url", label: "Link", kind: "url", placeholder: "company.com" },
      { key: "description", label: "What you did", kind: "rich", description: "Lead with impact: action, scope, measurable result." },
    ],
    title: (e) => str(e.position) || str(e.company) || "New role",
    subtitle: (e) => join(e.company, e.location, range(e)),
  },
  projects: {
    fields: [
      { key: "name", label: "Name", kind: "text", half: true },
      { key: "role", label: "Role", kind: "text", half: true },
      ...dates,
      { key: "url", label: "Link", kind: "url", placeholder: "github.com/you/project" },
      { key: "description", label: "Description", kind: "rich" },
    ],
    title: (e) => str(e.name) || "New project",
    subtitle: (e) => join(e.role, range(e)),
  },
  skills: {
    fields: [
      { key: "name", label: "Group", kind: "text", placeholder: "Languages" },
      { key: "skills", label: "Skills", kind: "text", placeholder: "TypeScript, Go, SQL", description: "Separate with commas." },
    ],
    title: (e) => str(e.name) || "Skill group",
    subtitle: (e) => str(e.skills),
  },
  education: {
    fields: [
      { key: "institution", label: "School", kind: "text" },
      { key: "degree", label: "Degree", kind: "text", half: true, placeholder: "B.S." },
      { key: "field", label: "Field of study", kind: "text", half: true },
      ...dates,
      { key: "gpa", label: "GPA", kind: "text", half: true },
      { key: "location", label: "Location", kind: "text", half: true },
      { key: "honors", label: "Honors", kind: "text" },
    ],
    title: (e) => str(e.institution) || "New education",
    subtitle: (e) => join(e.degree, e.field, range(e)),
  },
  certifications: {
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "issuer", label: "Issuer", kind: "text", half: true },
      { key: "date", label: "Issued", kind: "month", half: true },
      { key: "url", label: "Link", kind: "url", placeholder: "credential URL" },
    ],
    title: (e) => str(e.name) || "New certification",
    subtitle: (e) => join(e.issuer, formatMonth(str(e.date))),
  },
  languages: {
    fields: [
      { key: "name", label: "Language", kind: "text", half: true },
      { key: "level", label: "Level", kind: "text", half: true, placeholder: "Native, Fluent, B2…" },
    ],
    title: (e) => str(e.name) || "New language",
    subtitle: (e) => str(e.level),
  },
  interests: {
    fields: [
      { key: "name", label: "Interest", kind: "text" },
      { key: "keywords", label: "Details", kind: "text", placeholder: "Trail running, marathons", description: "Separate with commas." },
    ],
    title: (e) => str(e.name) || "New interest",
    subtitle: (e) => str(e.keywords),
  },
  awards: {
    fields: [
      { key: "title", label: "Award", kind: "text" },
      { key: "awarder", label: "Awarded by", kind: "text", half: true },
      { key: "date", label: "Date", kind: "month", half: true },
      { key: "description", label: "Description", kind: "rich" },
    ],
    title: (e) => str(e.title) || "New award",
    subtitle: (e) => join(e.awarder, formatMonth(str(e.date))),
  },
  publications: {
    fields: [
      { key: "name", label: "Title", kind: "text" },
      { key: "publisher", label: "Publisher", kind: "text", half: true },
      { key: "date", label: "Date", kind: "month", half: true },
      { key: "url", label: "Link", kind: "url" },
      { key: "description", label: "Description", kind: "rich" },
    ],
    title: (e) => str(e.name) || "New publication",
    subtitle: (e) => join(e.publisher, formatMonth(str(e.date))),
  },
  volunteer: {
    fields: [
      { key: "position", label: "Role", kind: "text", half: true },
      { key: "organization", label: "Organization", kind: "text", half: true },
      { key: "location", label: "Location", kind: "text" },
      ...dates,
      { key: "description", label: "Description", kind: "rich" },
    ],
    title: (e) => str(e.position) || str(e.organization) || "New role",
    subtitle: (e) => join(e.organization, range(e)),
  },
  references: {
    fields: [
      { key: "name", label: "Name", kind: "text", half: true },
      { key: "relationship", label: "Relationship", kind: "text", half: true, placeholder: "Former manager, Acme" },
      { key: "contact", label: "Contact", kind: "text", placeholder: "Email or phone", description: "Hidden on your public page when contact details are hidden." },
      { key: "description", label: "Note", kind: "rich" },
    ],
    title: (e) => str(e.name) || "New reference",
    subtitle: (e) => str(e.relationship),
  },
  custom: {
    fields: [
      { key: "title", label: "Title", kind: "text", half: true },
      { key: "subtitle", label: "Subtitle", kind: "text", half: true },
      { key: "date", label: "Date", kind: "text", half: true, placeholder: "2021, or 2020 – 2022" },
      { key: "url", label: "Link", kind: "url", half: true },
      { key: "description", label: "Description", kind: "rich" },
    ],
    title: (e) => str(e.title) || "New entry",
    subtitle: (e) => join(e.subtitle, e.date),
  },
}
