import { displayUrl, httpsUrl } from "./format"
import type { ResumeData } from "./types"

export type ContactKind = "email" | "phone" | "location" | "website" | "link"
export type Contact = { kind: ContactKind; label: string; href?: string }

/** Header contact details in display order, skipping empty ones. */
export function contacts(data: ResumeData): Contact[] {
  const p = data.personalInfo
  const link = (value: string, kind: ContactKind, label?: string): Contact | null =>
    value.trim() ? { kind, label: label?.trim() || displayUrl(value), href: httpsUrl(value) } : null
  return [
    p.email.trim() ? { kind: "email" as const, label: p.email.trim(), href: `mailto:${p.email.trim()}` } : null,
    p.phone.trim() ? { kind: "phone" as const, label: p.phone.trim(), href: `tel:${p.phone.replace(/[^\d+]/g, "")}` } : null,
    p.location.trim() ? { kind: "location" as const, label: p.location.trim() } : null,
    link(p.website, "website"),
    link(p.linkedin, "link"),
    link(p.github, "link"),
    ...p.links.map((l) => link(l.url, "link", l.label)),
  ].filter((c): c is Contact => c !== null)
}

/** Contact details as plain strings; links show their address so they survive copy and paste. */
export function contactLines(data: ResumeData): string[] {
  return contacts(data).map((c) => (c.href && !c.href.startsWith("mailto:") && !c.href.startsWith("tel:") ? displayUrl(c.href) : c.label))
}
