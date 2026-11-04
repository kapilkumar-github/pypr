import type { RichTextValue } from "@/components/editor/rich-text-extensions"

export type RichText = RichTextValue | null

export interface LinkItem {
  id: string
  label: string
  url: string
}

export interface PersonalInfo {
  fullName: string
  jobTitle: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  /** Extra header links (portfolio, YouTube, …). */
  links: LinkItem[]
  summary: RichText
}

/** Every list entry can be kept in the editor but left off the page. */
interface Entry {
  id: string
  hidden?: boolean
}

export interface ExperienceItem extends Entry {
  position: string
  company: string
  location: string
  startDate: string
  endDate: string
  current: boolean
  url: string
  description: RichText
}

export interface EducationItem extends Entry {
  institution: string
  degree: string
  field: string
  location: string
  startDate: string
  endDate: string
  gpa: string
  honors: string
}

export interface SkillCategory extends Entry {
  name: string
  /** Comma-separated list, kept as typed. */
  skills: string
}

export interface ProjectItem extends Entry {
  name: string
  role: string
  url: string
  startDate: string
  endDate: string
  description: RichText
}

export interface CertificationItem extends Entry {
  name: string
  issuer: string
  date: string
  url: string
}

export interface LanguageItem extends Entry {
  name: string
  level: string
}

export interface InterestItem extends Entry {
  name: string
  keywords: string
}

export interface AwardItem extends Entry {
  title: string
  awarder: string
  date: string
  description: RichText
}

export interface PublicationItem extends Entry {
  name: string
  publisher: string
  date: string
  url: string
  description: RichText
}

export interface VolunteerItem extends Entry {
  organization: string
  position: string
  location: string
  startDate: string
  endDate: string
  description: RichText
}

export interface ReferenceItem extends Entry {
  name: string
  relationship: string
  contact: string
  description: RichText
}

export interface CustomItem extends Entry {
  title: string
  subtitle: string
  date: string
  url: string
  description: RichText
}

export interface CustomSection {
  id: string
  items: CustomItem[]
}

/** Sections that store their entries in a top-level list of the same name. */
export const LIST_SECTIONS = [
  "experience",
  "projects",
  "skills",
  "education",
  "certifications",
  "languages",
  "interests",
  "awards",
  "publications",
  "volunteer",
  "references",
] as const
export type ListSectionId = (typeof LIST_SECTIONS)[number]
export type BuiltinSectionId = "summary" | ListSectionId
export type CustomSectionId = `custom:${string}`
export type SectionId = BuiltinSectionId | CustomSectionId

/** Placement and visibility of one section; `ResumeData.sections` order is the print order. */
export interface SectionMeta {
  id: SectionId
  /** Custom heading; empty uses the default name. */
  title: string
  hidden: boolean
  /** Hide the heading, keep the content. */
  hideHeading: boolean
  /** Start this section on a new page when printing. */
  pageBreak: boolean
  /** Lay entries out in two columns. */
  columns: 1 | 2
  /** Column in two-column templates. */
  column: "main" | "side"
}

export const TEMPLATES = [
  { id: "modern", name: "Modern", columns: 1 },
  { id: "classic", name: "Classic", columns: 1 },
  { id: "minimal", name: "Minimal", columns: 1 },
  { id: "executive", name: "Executive", columns: 1 },
  { id: "sidebar", name: "Sidebar", columns: 2 },
  { id: "split", name: "Split", columns: 2 },
] as const
export type TemplateId = (typeof TEMPLATES)[number]["id"]

export const ACCENT_COLORS = [
  { name: "Indigo", value: "#4f46e5" },
  { name: "Royal blue", value: "#2563eb" },
  { name: "Emerald", value: "#059669" },
  { name: "Teal", value: "#0d9488" },
  { name: "Burgundy", value: "#991b1b" },
  { name: "Amber", value: "#d97706" },
  { name: "Graphite", value: "#334155" },
  { name: "Slate", value: "#0f172a" },
] as const

export type PaperSize = "a4" | "letter"

/** "template" keeps each template's own typeface. */
export const FONTS = [
  { id: "template", name: "Template" },
  { id: "sans", name: "Sans" },
  { id: "serif", name: "Serif" },
  { id: "mono", name: "Tech" },
] as const
export type FontId = (typeof FONTS)[number]["id"]

/** Multiplier applied to the gaps between sections and entries. */
/** Overall tightness: `factor` scales the gaps between sections and entries, `line` scales line height. */
export const DENSITIES = [
  { id: "compact", name: "Compact", factor: 0.7, line: 0.88 },
  { id: "normal", name: "Normal", factor: 1, line: 1 },
  { id: "spacious", name: "Roomy", factor: 1.3, line: 1.1 },
] as const
export type DensityId = (typeof DENSITIES)[number]["id"]

/** Page padding multiplier. */
export const MARGINS = [
  { id: "narrow", name: "Narrow", factor: 0.65 },
  { id: "normal", name: "Normal", factor: 1 },
  { id: "wide", name: "Wide", factor: 1.3 },
] as const
export type MarginId = (typeof MARGINS)[number]["id"]

/** Scales all text on the page. */
export const TEXT_SIZES = [
  { id: "s", name: "S", factor: 0.92 },
  { id: "m", name: "M", factor: 1 },
  { id: "l", name: "L", factor: 1.08 },
  { id: "xl", name: "XL", factor: 1.16 },
] as const
export type TextSizeId = (typeof TEXT_SIZES)[number]["id"]

export const LINE_HEIGHTS = [
  { id: "tight", name: "Tight", value: 1.4 },
  { id: "normal", name: "Normal", value: 1.6 },
  { id: "relaxed", name: "Relaxed", value: 1.8 },
] as const
export type LineHeightId = (typeof LINE_HEIGHTS)[number]["id"]

/** How an entry's title, organization, date and location are arranged. */
export const ENTRY_LAYOUTS = [
  { id: "split", name: "Split", hint: "Title left, date right" },
  { id: "stacked", name: "Stacked", hint: "Date and place under the title" },
  { id: "compact", name: "One line", hint: "Everything on one line" },
] as const
export type EntryLayoutId = (typeof ENTRY_LAYOUTS)[number]["id"]

export const HEADING_STYLES = [
  { id: "template", name: "Template" },
  { id: "plain", name: "None" },
  { id: "rule", name: "Rule" },
  { id: "bar", name: "Bar" },
  { id: "band", name: "Band" },
] as const
export type HeadingStyleId = (typeof HEADING_STYLES)[number]["id"]

export const DATE_FORMATS = [
  { id: "MMM yyyy", name: "Mar 2022" },
  { id: "MMMM yyyy", name: "March 2022" },
  { id: "MM/yyyy", name: "03/2022" },
  { id: "yyyy-MM", name: "2022-03" },
  { id: "yyyy", name: "2022" },
] as const
export type DateFormatId = (typeof DATE_FORMATS)[number]["id"]

export interface ResumeSettings {
  template: TemplateId
  accentColor: string
  paperSize: PaperSize
  font: FontId
  density: DensityId
  margins: MarginId
  textSize: TextSizeId
  lineHeight: LineHeightId
  entryLayout: EntryLayoutId
  headingStyle: HeadingStyleId
  dateFormat: DateFormatId
  underlineLinks: boolean
  showIcons: boolean
  sidebarSide: "left" | "right"
  /** Sidebar width in percent of the page, for two-column templates. */
  sidebarWidth: number
}

export interface ResumeData {
  version: 1
  personalInfo: PersonalInfo
  sections: SectionMeta[]
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: SkillCategory[]
  projects: ProjectItem[]
  certifications: CertificationItem[]
  languages: LanguageItem[]
  interests: InterestItem[]
  awards: AwardItem[]
  publications: PublicationItem[]
  volunteer: VolunteerItem[]
  references: ReferenceItem[]
  customSections: CustomSection[]
  settings: ResumeSettings
}
