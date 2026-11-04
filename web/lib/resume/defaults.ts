import { newId } from "./ids"
import { CORE_SECTIONS, SECTION_INFO, sectionMeta } from "./sections"
import {
  DATE_FORMATS,
  DENSITIES,
  ENTRY_LAYOUTS,
  FONTS,
  HEADING_STYLES,
  LINE_HEIGHTS,
  LIST_SECTIONS,
  MARGINS,
  TEMPLATES,
  TEXT_SIZES,
  type CustomSection,
  type ResumeData,
  type ResumeSettings,
  type RichText,
  type SectionId,
  type SectionMeta,
} from "./types"

export { newId }

export const DEFAULT_SETTINGS: ResumeSettings = {
  template: "modern",
  accentColor: "#4f46e5",
  paperSize: "a4",
  font: "template",
  density: "normal",
  margins: "normal",
  textSize: "m",
  lineHeight: "normal",
  entryLayout: "split",
  headingStyle: "template",
  dateFormat: "MMM yyyy",
  underlineLinks: false,
  showIcons: false,
  sidebarSide: "left",
  sidebarWidth: 32,
}

export function blankResume(): ResumeData {
  return {
    version: 1,
    personalInfo: {
      fullName: "",
      jobTitle: "",
      email: "",
      phone: "",
      location: "",
      website: "",
      linkedin: "",
      github: "",
      links: [],
      summary: null,
    },
    sections: CORE_SECTIONS.map((id) => sectionMeta(id)),
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    interests: [],
    awards: [],
    publications: [],
    volunteer: [],
    references: [],
    customSections: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []) as T[]
const oneOf = <T extends string>(v: unknown, options: readonly { id: T }[], fallback: T): T =>
  options.some((o) => o.id === v) ? (v as T) : fallback

function normalizeSettings(raw: unknown): ResumeSettings {
  const s = obj(raw)
  const d = DEFAULT_SETTINGS
  return {
    template: oneOf(s.template, TEMPLATES, d.template),
    accentColor: typeof s.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(s.accentColor) ? s.accentColor : d.accentColor,
    paperSize: s.paperSize === "letter" ? "letter" : "a4",
    font: oneOf(s.font, FONTS, d.font),
    density: oneOf(s.density, DENSITIES, d.density),
    margins: oneOf(s.margins, MARGINS, d.margins),
    textSize: oneOf(s.textSize, TEXT_SIZES, d.textSize),
    lineHeight: oneOf(s.lineHeight, LINE_HEIGHTS, d.lineHeight),
    entryLayout: oneOf(s.entryLayout, ENTRY_LAYOUTS, d.entryLayout),
    headingStyle: oneOf(s.headingStyle, HEADING_STYLES, d.headingStyle),
    dateFormat: oneOf(s.dateFormat, DATE_FORMATS, d.dateFormat),
    underlineLinks: typeof s.underlineLinks === "boolean" ? s.underlineLinks : d.underlineLinks,
    showIcons: typeof s.showIcons === "boolean" ? s.showIcons : d.showIcons,
    sidebarSide: s.sidebarSide === "right" ? "right" : "left",
    sidebarWidth:
      typeof s.sidebarWidth === "number" && s.sidebarWidth >= 25 && s.sidebarWidth <= 45 ? Math.round(s.sidebarWidth) : d.sidebarWidth,
  }
}

/**
 * Section order: keeps stored entries that point at real sections, then appends core sections that are
 * missing and any optional section that has entries (older documents had no section list).
 */
function normalizeSections(raw: unknown, data: Omit<ResumeData, "sections">): SectionMeta[] {
  const customIds = new Set(data.customSections.map((c) => `custom:${c.id}`))
  const valid = (id: unknown): id is SectionId =>
    typeof id === "string" && (id === "summary" || (LIST_SECTIONS as readonly string[]).includes(id) || customIds.has(id))
  const seen = new Set<string>()
  const out: SectionMeta[] = []
  for (const m of list<Record<string, unknown>>(raw)) {
    if (!valid(m.id) || seen.has(m.id)) continue
    seen.add(m.id)
    out.push(
      sectionMeta(m.id, {
        title: typeof m.title === "string" ? m.title.slice(0, 80) : "",
        hidden: m.hidden === true,
        hideHeading: m.hideHeading === true,
        pageBreak: m.pageBreak === true,
        columns: m.columns === 2 ? 2 : 1,
        ...(m.column === "main" || m.column === "side" ? { column: m.column } : {}),
      }),
    )
  }
  const add = (id: SectionId) => {
    if (seen.has(id)) return
    seen.add(id)
    out.push(sectionMeta(id))
  }
  CORE_SECTIONS.forEach(add)
  for (const id of LIST_SECTIONS) if (SECTION_INFO[id].optional && data[id].length > 0) add(id)
  customIds.forEach((id) => add(id as SectionId))
  return out
}

/** Fills gaps in stored data so older or partial documents always render. */
export function normalizeResume(raw: unknown): ResumeData {
  const base = blankResume()
  const d = obj(raw)
  const p = obj(d.personalInfo)
  const rest = {
    version: 1 as const,
    personalInfo: { ...base.personalInfo, ...p, links: list(p.links) } as ResumeData["personalInfo"],
    experience: list<ResumeData["experience"][number]>(d.experience).map((e) => ({ ...e, url: typeof e.url === "string" ? e.url : "" })),
    education: list<ResumeData["education"][number]>(d.education),
    skills: list<ResumeData["skills"][number]>(d.skills),
    projects: list<ResumeData["projects"][number]>(d.projects),
    certifications: list<ResumeData["certifications"][number]>(d.certifications).map((c) => ({ ...c, url: typeof c.url === "string" ? c.url : "" })),
    languages: list<ResumeData["languages"][number]>(d.languages),
    interests: list<ResumeData["interests"][number]>(d.interests),
    awards: list<ResumeData["awards"][number]>(d.awards),
    publications: list<ResumeData["publications"][number]>(d.publications),
    volunteer: list<ResumeData["volunteer"][number]>(d.volunteer),
    references: list<ResumeData["references"][number]>(d.references),
    customSections: list<CustomSection>(d.customSections)
      .filter((c) => typeof c.id === "string")
      .map((c) => ({ id: c.id, items: list<CustomSection["items"][number]>(c.items) })),
    settings: normalizeSettings(d.settings),
  }
  return { ...rest, sections: normalizeSections(d.sections, rest) }
}

const paragraph = (text: string): RichText => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
})

const bullets = (items: string[]): RichText => ({
  type: "doc",
  content: [
    {
      type: "bulletList",
      content: items.map((text) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      })),
    },
  ],
})

export function softwareEngineerExample(): ResumeData {
  return {
    ...blankResume(),
    personalInfo: {
      fullName: "Alexander Vance",
      jobTitle: "Senior Full Stack Software Engineer",
      email: "alex.vance@example.com",
      phone: "+1 (415) 892-3419",
      location: "San Francisco, CA",
      website: "alexvance.dev",
      linkedin: "linkedin.com/in/alexandervance",
      github: "github.com/alexvance",
      links: [],
      summary: paragraph(
        "Senior full stack engineer with 7+ years building distributed cloud systems and real-time web apps. Scaled platforms to 15M+ monthly users while cutting API p99 latency by 45%. Specialized in TypeScript, React, Go and Kubernetes.",
      ),
    },
    experience: [
      {
        id: newId(),
        position: "Staff Software Engineer",
        company: "HyperScale Tech",
        location: "San Francisco, CA",
        startDate: "2022-03",
        endDate: "",
        current: true,
        url: "",
        description: bullets([
          "Architected a real-time payment ingestion pipeline in Go and Kafka handling $42M+ daily volume at 99.999% uptime.",
          "Led the frontend migration to Next.js, trimming bundle size by 38% and LCP from 2.8s to 0.9s.",
          "Mentored 8 engineers across 3 squads and set company-wide RFC review standards.",
        ]),
      },
      {
        id: newId(),
        position: "Senior Software Engineer",
        company: "CloudFlow Analytics",
        location: "San Jose, CA",
        startDate: "2019-06",
        endDate: "2022-02",
        current: false,
        url: "",
        description: bullets([
          "Built a dashboard engine rendering 500k+ live telemetry metrics with WebAssembly and WebGL.",
          "Redesigned PostgreSQL sharding, cutting query time by 62% for enterprise accounts.",
          "Automated CI/CD with GitHub Actions and Docker, reducing deploys from 45 to 6 minutes.",
        ]),
      },
    ],
    education: [
      {
        id: newId(),
        institution: "University of California, Berkeley",
        degree: "B.S.",
        field: "Computer Science",
        location: "Berkeley, CA",
        startDate: "2013-09",
        endDate: "2017-05",
        gpa: "3.88 / 4.0",
        honors: "Dean's Honor List",
      },
    ],
    skills: [
      { id: newId(), name: "Languages", skills: "TypeScript, Go, Python, SQL" },
      { id: newId(), name: "Frameworks", skills: "React, Next.js, Node.js, gRPC" },
      { id: newId(), name: "Infrastructure", skills: "Kubernetes, AWS, PostgreSQL, Kafka, Terraform" },
    ],
    projects: [
      {
        id: newId(),
        name: "OpenTrace",
        role: "Creator",
        url: "github.com/alexvance/opentrace",
        startDate: "2021-01",
        endDate: "",
        description: bullets(["Open-source distributed tracing UI with 3.2k GitHub stars."]),
      },
    ],
    certifications: [
      {
        id: newId(),
        name: "AWS Certified Solutions Architect – Professional",
        issuer: "Amazon Web Services",
        date: "2023-04",
        url: "",
      },
    ],
  }
}
