import { blankResume, bullets, newId, normalizeResume, paragraph } from "./defaults"
import type { ResumeData } from "./types"

/** Fields the API extracts from an uploaded resume (`POST /api/resumes/parse`). Dates are "YYYY-MM" or "". */
export type ParsedResume = {
  fullName: string
  jobTitle: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  summary: string
  experience: { position: string; company: string; location: string; startDate: string; endDate: string; current: boolean; bullets: string[] }[]
  education: { institution: string; degree: string; field: string; location: string; startDate: string; endDate: string; gpa: string; honors: string }[]
  skills: { name: string; skills: string[] }[]
  projects: { name: string; role: string; url: string; startDate: string; endDate: string; bullets: string[] }[]
  certifications: { name: string; issuer: string; date: string; url: string }[]
  languages: { name: string; level: string }[]
  awards: { title: string; awarder: string; date: string; description: string }[]
  volunteer: { organization: string; position: string; location: string; startDate: string; endDate: string; bullets: string[] }[]
  publications: { name: string; publisher: string; date: string; url: string; description: string }[]
  interests: { name: string; keywords: string }[]
}

const list = (items: string[]) => (items.length ? bullets(items) : null)
const text = (s: string) => (s ? paragraph(s) : null)

/** Builds a resume (default design) from parsed upload fields, plus a title for the list. */
export function resumeFromParsed(p: ParsedResume, fileName: string): { title: string; data: ResumeData } {
  const blank = blankResume()
  const data: ResumeData = {
    ...blank,
    personalInfo: {
      ...blank.personalInfo,
      fullName: p.fullName,
      jobTitle: p.jobTitle,
      email: p.email,
      phone: p.phone,
      location: p.location,
      website: p.website,
      linkedin: p.linkedin,
      github: p.github,
      summary: text(p.summary),
    },
    experience: p.experience.map((e) => ({
      id: newId(),
      position: e.position,
      company: e.company,
      location: e.location,
      startDate: e.startDate,
      endDate: e.current ? "" : e.endDate,
      current: e.current,
      url: "",
      description: list(e.bullets),
    })),
    education: p.education.map((e) => ({ id: newId(), ...e })),
    skills: p.skills.map((s) => ({ id: newId(), name: s.name, skills: s.skills.join(", ") })),
    projects: p.projects.map((x) => ({
      id: newId(),
      name: x.name,
      role: x.role,
      url: x.url,
      startDate: x.startDate,
      endDate: x.endDate,
      description: list(x.bullets),
    })),
    certifications: p.certifications.map((c) => ({ id: newId(), ...c })),
    languages: p.languages.map((l) => ({ id: newId(), ...l })),
    interests: p.interests.map((i) => ({ id: newId(), ...i })),
    awards: p.awards.map((a) => ({ id: newId(), title: a.title, awarder: a.awarder, date: a.date, description: text(a.description) })),
    publications: p.publications.map((x) => ({ id: newId(), name: x.name, publisher: x.publisher, date: x.date, url: x.url, description: text(x.description) })),
    volunteer: p.volunteer.map((v) => ({
      id: newId(),
      organization: v.organization,
      position: v.position,
      location: v.location,
      startDate: v.startDate,
      endDate: v.endDate,
      description: list(v.bullets),
    })),
  }
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
  const title = (p.jobTitle || p.fullName || base || "Uploaded resume").slice(0, 200)
  // Normalizing adds the optional sections that now have entries (Languages, Awards, …) to the print order.
  return { title, data: normalizeResume(data) }
}
