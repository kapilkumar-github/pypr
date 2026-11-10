import { z } from "zod"

/** Fields a user can teach the extension. `arrangement` is the work arrangement (remote, hybrid, onsite). */
export const FIELDS = ["title", "company", "location", "arrangement", "employmentType", "salary", "description", "applicationUrl"] as const
export type Field = (typeof FIELDS)[number]
export const FieldSchema = z.enum(FIELDS)

export const FIELD_LABEL: Record<Field, string> = {
  title: "Job title",
  company: "Company",
  location: "Location",
  arrangement: "Work arrangement",
  employmentType: "Employment type",
  salary: "Salary",
  description: "Description",
  applicationUrl: "Application link",
}

// Limits keep stored configs and messages bounded, whatever a page or a peer sends.
export const MAX = { selector: 600, name: 80, host: 253, path: 300, text: 100_000, line: 500, configs: 200, patterns: 20, fallbacks: 3, query: 5 } as const

/** How a field's value is read from the element: its text, its structured text (lists and paragraphs kept), or an attribute. */
export const ModeSchema = z.enum(["text", "html", "attr"])
export type Mode = z.infer<typeof ModeSchema>

export const FieldMappingSchema = z.object({
  selector: z.string().min(1).max(MAX.selector),
  /** Other selectors tried, in order, when `selector` finds nothing. */
  fallbacks: z.array(z.string().min(1).max(MAX.selector)).max(MAX.fallbacks).default([]),
  mode: ModeSchema,
  attr: z.string().max(40).optional(),
  /** Tag of the element when it was chosen. A different tag later is reported instead of read. */
  expectTag: z.string().max(20).optional(),
})
export type FieldMapping = z.infer<typeof FieldMappingSchema>

export const QueryRuleSchema = z.object({
  name: z.string().min(1).max(60),
  /** Fixed value this parameter must have. Missing: any non-empty value. */
  value: z.string().max(200).optional(),
})
export type QueryRule = z.infer<typeof QueryRuleSchema>

export const HostRuleSchema = z.object({
  host: z.string().min(1).max(MAX.host),
  /** Also match subdomains of host. Off unless the user approves it. */
  subdomains: z.boolean().default(false),
})
export type HostRule = z.infer<typeof HostRuleSchema>

/** One job-detail layout on a site: a URL shape and the fields read from pages of that shape. */
export const PagePatternSchema = z.object({
  id: z.string().min(1).max(60),
  /** Segments like /job/view/:jobId. A `:name` segment varies; the others must match exactly. */
  path: z.string().min(1).max(MAX.path),
  query: z.array(QueryRuleSchema).max(MAX.query).default([]),
  fields: z.partialRecord(FieldSchema, FieldMappingSchema).default({}),
})
export type PagePattern = z.infer<typeof PagePatternSchema>

export const SiteConfigSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(MAX.name),
  /** Known applicant tracking system, if the user or a bundled adapter says so. Separate from the site. */
  ats: z.string().max(40).optional(),
  hosts: z.array(HostRuleSchema).min(1).max(5),
  patterns: z.array(PagePatternSchema).max(MAX.patterns),
  enabled: z.boolean().default(true),
  version: z.number().int().min(0),
  updatedAt: z.string().max(40),
  /** Shipped with the extension: patterns only, read-only. */
  bundled: z.boolean().optional(),
})
export type SiteConfig = z.infer<typeof SiteConfigSchema>

export const ARRANGEMENTS = ["remote", "hybrid", "onsite", "unknown"] as const
export type Arrangement = (typeof ARRANGEMENTS)[number]

/** The job as the form shows it. Strings stay strings so the form is editable; the API checks them again. */
export const JobFormSchema = z.object({
  title: z.string().max(300),
  company: z.string().max(200),
  location: z.string().max(300),
  workArrangement: z.enum(ARRANGEMENTS),
  employmentType: z.string().max(100),
  salaryText: z.string().max(300),
  salaryMin: z.string().max(20),
  salaryMax: z.string().max(20),
  salaryCurrency: z.string().max(3),
  salaryPeriod: z.enum(["", "year", "month", "week", "day", "hour"]),
  description: z.string().max(MAX.text),
  discoveryUrl: z.string().max(2000),
  applicationUrl: z.string().max(2000),
  source: z.string().max(40),
  externalId: z.string().max(200),
})
export type JobForm = z.infer<typeof JobFormSchema>

export const emptyForm = (discoveryUrl = ""): JobForm => ({
  title: "", company: "", location: "", workArrangement: "unknown", employmentType: "", salaryText: "", salaryMin: "", salaryMax: "",
  salaryCurrency: "", salaryPeriod: "", description: "", discoveryUrl, applicationUrl: "", source: "", externalId: "",
})

/** Sources the Pypr API accepts. Anything else is sent as "company_site" or empty. */
export const SOURCES = ["greenhouse", "lever", "workday", "workable", "ashby", "smartrecruiters", "linkedin", "indeed", "company_site", "referral", "other"] as const

export const SettingsSchema = z.object({
  /** Show the floating icon on recognized job pages (needs site access). */
  autoLauncher: z.boolean().default(true),
})
export type Settings = z.infer<typeof SettingsSchema>
export const DEFAULT_SETTINGS: Settings = { autoLauncher: true }

export const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.string(), emailVerified: z.boolean() })
export type User = z.infer<typeof UserSchema>
