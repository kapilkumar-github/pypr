import type { DateFormatId, RichText } from "./types"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "2022-03" → "Mar 2022" (or the chosen format). Unknown values pass through unchanged. */
export function formatMonth(value: string, format: DateFormatId = "MMM yyyy"): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  if (!m) return value
  const [, y, mm] = m
  const i = Number(mm) - 1
  switch (format) {
    case "MMMM yyyy":
      return `${MONTHS_LONG[i] ?? ""} ${y}`.trim()
    case "MM/yyyy":
      return `${mm}/${y}`
    case "yyyy-MM":
      return `${y}-${mm}`
    case "yyyy":
      return y!
    default:
      return `${MONTHS[i] ?? ""} ${y}`.trim()
  }
}

export function formatRange(start: string, end: string, current = false, format?: DateFormatId): string {
  const s = formatMonth(start, format)
  const e = current ? "Present" : formatMonth(end, format)
  return s === e ? s : [s, e].filter(Boolean).join(" – ")
}

/** Strips any scheme so display text is clean; links are rebuilt as https. */
export function displayUrl(value: string): string {
  return value.trim().replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "")
}

export function httpsUrl(value: string): string {
  return `https://${value.trim().replace(/^[a-z]+:\/\//i, "")}`
}

export function isRichTextEmpty(value: RichText): boolean {
  if (!value) return true
  const hasText = (n: { text?: string; content?: unknown[] }): boolean =>
    Boolean(n.text?.trim()) || (n.content ?? []).some((c) => hasText(c as never))
  return !hasText(value)
}

export function splitSkills(skills: string): string[] {
  return skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
]

/** "2 hours ago", "yesterday", "just now". Call on the client only (depends on the current time). */
export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return "just now"
}
