import type { JobInput, JobSource, JobStatus, NextAction, SalaryPeriod, TrackedJob, WorkArrangement } from "@/lib/api/tracker"

export const STATUSES: { id: JobStatus; name: string; hint: string }[] = [
  { id: "saved", name: "Saved", hint: "Worth a look" },
  { id: "preparing", name: "Preparing", hint: "Tailoring the resume" },
  { id: "applied", name: "Applied", hint: "Submitted on the employer's site" },
  { id: "interviewing", name: "Interviewing", hint: "In the interview process" },
  { id: "offer", name: "Offer", hint: "Offer received" },
  { id: "accepted", name: "Accepted", hint: "Offer accepted" },
  { id: "rejected", name: "Rejected", hint: "Not moving forward" },
  { id: "withdrawn", name: "Withdrawn", hint: "You stepped out" },
  { id: "closed", name: "Closed", hint: "Listing closed or gone" },
]

export const statusName = (s: JobStatus) => STATUSES.find((x) => x.id === s)?.name ?? s

/** Badge tone per status, from semantic tokens only. */
export function statusTone(s: JobStatus): string {
  switch (s) {
    case "applied":
    case "interviewing":
      return "bg-accent text-accent-foreground"
    case "offer":
    case "accepted":
      return "bg-success/10 text-success"
    case "rejected":
      return "bg-destructive/10 text-destructive"
    case "withdrawn":
    case "closed":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-secondary text-secondary-foreground"
  }
}

export const ARRANGEMENTS: { id: WorkArrangement; name: string }[] = [
  { id: "remote", name: "Remote" },
  { id: "hybrid", name: "Hybrid" },
  { id: "onsite", name: "Onsite" },
  { id: "unknown", name: "Not stated" },
]

export const arrangementName = (a: WorkArrangement) => ARRANGEMENTS.find((x) => x.id === a)?.name ?? a

export const SOURCES: { id: JobSource; name: string }[] = [
  { id: "greenhouse", name: "Greenhouse" },
  { id: "lever", name: "Lever" },
  { id: "workday", name: "Workday" },
  { id: "workable", name: "Workable" },
  { id: "ashby", name: "Ashby" },
  { id: "smartrecruiters", name: "SmartRecruiters" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "indeed", name: "Indeed" },
  { id: "company_site", name: "Company website" },
  { id: "referral", name: "Referral" },
  { id: "other", name: "Other" },
]

export const sourceName = (s: string) => SOURCES.find((x) => x.id === s)?.name ?? ""

export const PERIODS: { id: SalaryPeriod; name: string }[] = [
  { id: "year", name: "per year" },
  { id: "month", name: "per month" },
  { id: "week", name: "per week" },
  { id: "day", name: "per day" },
  { id: "hour", name: "per hour" },
]

export function salaryText(j: Pick<TrackedJob, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod">): string {
  if (j.salaryMin == null && j.salaryMax == null) return ""
  const fmt = (n: number) =>
    j.salaryCurrency
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: j.salaryCurrency, maximumFractionDigits: 0 }).format(n)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
  const range =
    j.salaryMin != null && j.salaryMax != null && j.salaryMin !== j.salaryMax
      ? `${fmt(j.salaryMin)} – ${fmt(j.salaryMax)}`
      : fmt((j.salaryMin ?? j.salaryMax)!)
  const period = PERIODS.find((p) => p.id === j.salaryPeriod)?.name
  return period ? `${range} ${period}` : range
}

export const emptyJob = (): JobInput => ({
  company: "",
  title: "",
  location: "",
  workArrangement: "unknown",
  employmentType: "",
  discoveryUrl: "",
  applicationUrl: "",
  portalUrl: "",
  applicationRef: "",
  source: "",
  externalId: "",
  description: "",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: "",
  salaryPeriod: "",
  resumeId: null,
})

export function jobToInput(j: TrackedJob & { description: string }): JobInput {
  return {
    company: j.company,
    title: j.title,
    location: j.location,
    workArrangement: j.workArrangement,
    employmentType: j.employmentType,
    discoveryUrl: j.discoveryUrl,
    applicationUrl: j.applicationUrl,
    portalUrl: j.portalUrl,
    applicationRef: j.applicationRef,
    source: j.source,
    externalId: j.externalId,
    description: j.description,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryCurrency: j.salaryCurrency,
    salaryPeriod: j.salaryPeriod,
    resumeId: j.resumeId,
    appliedAt: j.appliedAt,
  }
}

/** Today's calendar date in the user's time zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  return dateInput(now)
}

/** A Date as YYYY-MM-DD in local time. */
export function dateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type DueState = "overdue" | "today" | "soon" | "later" | "none" | "done"

/** Where an open next action stands against the user's local date. "soon" is within 3 days. */
export function dueState(a: NextAction, today = localToday()): DueState {
  if (!a.text) return "none"
  if (a.doneAt) return "done"
  if (!a.due) return "later"
  if (a.due < today) return "overdue"
  if (a.due === today) return "today"
  const days = (Date.parse(a.due) - Date.parse(today)) / 86_400_000
  return days <= 3 ? "soon" : "later"
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(iso))
}

/** A YYYY-MM-DD date without shifting it through UTC. */
export function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(y!, m! - 1, d!))
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone")
  } catch {
    return [browserTimeZone()]
  }
}

/** Offset of tz from UTC at instant t, in ms. */
function tzOffset(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - t
}

/** "2026-03-02T15:30" read as wall time in tz, to an ISO instant. */
export function zonedToIso(local: string, tz: string): string {
  const [date, time] = local.split("T")
  const [y, m, d] = date!.split("-").map(Number)
  const [hh, mm] = time!.split(":").map(Number)
  const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!)
  let t = wall - tzOffset(wall, tz)
  t = wall - tzOffset(t, tz) // second pass settles DST edges
  return new Date(t).toISOString()
}

/** An ISO instant as "YYYY-MM-DDTHH:mm" wall time in tz, for datetime-local inputs. */
export function isoToZoned(iso: string, tz: string): string {
  const t = Date.parse(iso)
  const local = new Date(t + tzOffset(t, tz))
  return local.toISOString().slice(0, 16)
}

/** Safe external link: only http(s) addresses are rendered as links. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}
