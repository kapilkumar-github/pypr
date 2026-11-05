import { contacts } from "./contact"
import { resumeOutline, resumeToPlainText } from "./plain-text"
import { SECTION_INFO, isCustom, sectionEntries } from "./sections"
import { TEMPLATES, type ResumeData } from "./types"

export type CheckCategory = "Contact details" | "Dates" | "Layout" | "Section headings" | "Writing"
export const CHECK_CATEGORIES: CheckCategory[] = ["Contact details", "Dates", "Layout", "Section headings", "Writing"]

export type Check = {
  id: string
  category: CheckCategory
  label: string
  pass: boolean
  /** What to change, shown when the check fails. */
  fix: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const STANDARD_HEADINGS = new Set(
  [
    "summary", "profile", "professional summary", "about", "about me", "objective",
    "experience", "work experience", "professional experience", "employment", "employment history", "work history",
    "education", "skills", "technical skills", "core skills", "key skills",
    "projects", "certifications", "certificates", "licenses", "languages", "interests", "hobbies",
    "awards", "honors", "achievements", "publications", "volunteering", "volunteer", "volunteer experience",
    "references",
  ],
)
const WEAK = /\b(responsible for|duties included|worked on|helped with|tasked with)\b/i
const FIRST_PERSON = /(^|[\s(])(i|my|me)\b/i

const month = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : "")
const thisMonth = () => new Date().toISOString().slice(0, 7)

/**
 * Rule-based checks for how reliably applicant tracking software reads the resume.
 * `pages` is the on-screen page count, when known.
 */
export function runChecks(data: ResumeData, pages?: number): Check[] {
  const p = data.personalInfo
  const outline = resumeOutline(data)
  const visible = (id: string) => data.sections.some((m) => m.id === id && !m.hidden)
  const dated = (["experience", "projects", "education", "volunteer"] as const).flatMap((id) =>
    visible(id) ? sectionEntries(data, id).filter((e) => !e.hidden) : [],
  )
  const experience = visible("experience") ? data.experience.filter((e) => !e.hidden) : []
  const bullets = outline.sections
    .filter((s) => s.id !== "summary")
    .flatMap((s) => s.entries.flatMap((e) => e.lines.map((l) => l.text)))
  const summaryWords = outline.sections.find((s) => s.id === "summary")?.entries[0]?.lines.map((l) => l.text).join(" ").split(/\s+/).filter(Boolean).length ?? 0
  const template = TEMPLATES.find((t) => t.id === data.settings.template)
  const customHeadings = data.sections.filter(
    (m) => !m.hidden && !m.hideHeading && !STANDARD_HEADINGS.has((m.title.trim() || (isCustom(m.id) ? "" : SECTION_INFO[m.id].name)).toLowerCase()),
  )
  const withNumbers = bullets.filter((b) => /\d/.test(b)).length
  const now = thisMonth()

  const c = (category: CheckCategory, id: string, label: string, pass: boolean, fix: string): Check => ({ id, category, label, pass, fix })
  return [
    c("Contact details", "name", "Full name is filled in", !!p.fullName.trim(), "Add your full name in the header."),
    c("Contact details", "headline", "Headline says what you do", !!p.jobTitle.trim(), "Add a headline such as “Senior Backend Engineer”."),
    c("Contact details", "email", "Email address is present", !!p.email.trim(), "Add an email address."),
    c("Contact details", "email-valid", "Email address looks valid", !p.email.trim() || EMAIL.test(p.email.trim()), "Check the email for typos."),
    c("Contact details", "phone", "Phone number is present", !!p.phone.trim(), "Add a phone number."),
    c("Contact details", "location", "Location is present", !!p.location.trim(), "Add a city and country, or “Remote”."),
    c("Contact details", "link", "At least one profile link", contacts(data).some((x) => x.kind === "website" || x.kind === "link"), "Add LinkedIn, GitHub or a portfolio link."),

    c("Dates", "start", "Every job has a start date", experience.every((e) => month(e.startDate)), "Add start dates to every experience entry."),
    c("Dates", "end", "Every job has an end date or “Present”", experience.every((e) => e.current || month(e.endDate)), "Add an end date, or tick “I work here now”."),
    c(
      "Dates",
      "order",
      "No end date is before its start",
      dated.every((e) => !month(e.startDate) || !month(e.endDate) || month(e.startDate) <= month(e.endDate)),
      "Fix entries whose end date comes before the start date.",
    ),
    c("Dates", "future", "No start dates in the future", dated.every((e) => !month(e.startDate) || month(e.startDate) <= now), "Fix start dates that are in the future."),
    c(
      "Dates",
      "education",
      "Education has dates",
      !visible("education") || data.education.filter((e) => !e.hidden).every((e) => month(e.endDate) || month(e.startDate)),
      "Add at least a graduation date to each education entry.",
    ),

    c("Layout", "columns", "One-column layout", template?.columns !== 2, "Two-column layouts can be read out of order by older parsers. A one-column template is safest."),
    c("Layout", "pages", "Two pages or fewer", pages === undefined || pages <= 2, "Trim older roles or use compact spacing to get to two pages."),
    c("Layout", "font", "Readable, standard typeface", data.settings.font !== "mono", "Monospace text reads as code to some parsers. Pick Sans or Serif."),
    c("Layout", "size", "Text isn't too small", data.settings.textSize !== "s", "Use text size M or larger."),
    c("Layout", "headings-shown", "Every section has a heading", data.sections.every((m) => m.hidden || !m.hideHeading || m.id === "summary"), "Turn headings back on so parsers know where sections start."),
    c("Layout", "experience", "Experience has entries", experience.length > 0, "Add at least one experience entry."),
    c("Layout", "text", "Everything is real text", resumeToPlainText(data).trim().length > 200, "Add more content; the resume reads as nearly empty."),

    c("Section headings", "standard", "Headings use standard names", customHeadings.length === 0, `Rename ${customHeadings.map((m) => `“${m.title || "Custom section"}”`).join(", ") || "custom headings"} to a common name such as Experience or Projects.`),
    c("Section headings", "core", "Experience, Education and Skills are shown", visible("experience") && visible("education") && visible("skills"), "Show the Experience, Education and Skills sections."),

    c(
      "Writing",
      "summary",
      "Summary is 20–90 words",
      !visible("summary") || (summaryWords >= 20 && summaryWords <= 90),
      summaryWords === 0 ? "Write a 2–4 sentence summary." : summaryWords < 20 ? "Expand the summary a little." : "Tighten the summary to under 90 words.",
    ),
    c("Writing", "numbers", "Half or more bullets have a number", bullets.length === 0 || withNumbers * 2 >= bullets.length, "Add measurable results (%, $, time saved, users) to more bullets."),
    c("Writing", "first-person", "No “I” or “my”", !bullets.some((b) => FIRST_PERSON.test(b)), "Start bullets with an action verb instead of “I”."),
    c("Writing", "weak", "No “responsible for” phrasing", !bullets.some((b) => WEAK.test(b)), "Replace “responsible for…” with what you did and the result."),
    c("Writing", "length", "Bullets are under 40 words", bullets.every((b) => b.split(/\s+/).length <= 40), "Split or shorten bullets longer than 40 words."),
  ]
}
