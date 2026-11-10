import type { JobForm } from "./schema"
import { SOURCES } from "./schema"

/** The only origins the extension will send a credential to. Set at build time. */
export const API_ORIGINS: readonly string[] = [new URL(import.meta.env.VITE_PYPR_API ?? "https://api.pypr.work").origin]
export const WEB_ORIGIN = new URL(import.meta.env.VITE_PYPR_WEB ?? "https://www.pypr.work").origin

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string> = {}) {
    super(message)
  }
}

export function apiUrl(path: string, base = API_ORIGINS[0]!, allowed: readonly string[] = API_ORIGINS): string {
  if (!path.startsWith("/api/") || path.includes("//") || path.includes("..")) throw new Error("Refusing to call a non-API path.")
  const u = new URL(path, base)
  if (!allowed.includes(u.origin)) throw new Error("Refusing to call an unlisted origin.")
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1"
  if (u.protocol !== "https:" && !local) throw new Error("The API must use https.")
  return u.toString()
}

export interface Client {
  token: string | null
  base?: string
  allowed?: readonly string[]
  fetch?: typeof fetch
}

export async function call<T>(c: Client, method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await (c.fetch ?? fetch)(apiUrl(path, c.base, c.allowed), {
    method,
    headers: { "Content-Type": "application/json", ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}), ...headers },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  })
  if (res.status === 204) return undefined as T
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? "unknown", json?.error?.message ?? "Something went wrong.", json?.error?.fields)
  return json as T
}

export interface Duplicate {
  id: string
  company: string
  title: string
  status: string
  /** url, external_id (strong) or company_title (weak). */
  reason: string
}

/** The tracker's job detail (the fields the extension uses). */
export interface SavedJob {
  id: string
  status: string
  appliedAt: string | null
}

const num = (s: string): number | null => {
  const n = parseFloat(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** The body of POST /api/tracked-jobs. Optional parts the form lacks are left empty rather than invented. */
export function jobInput(f: JobForm): Record<string, unknown> {
  const salary = f.salaryText.trim() && f.salaryMin === "" && f.salaryMax === ""
  return {
    company: f.company,
    title: f.title,
    location: f.location,
    workArrangement: f.workArrangement,
    employmentType: f.employmentType,
    discoveryUrl: f.discoveryUrl,
    applicationUrl: f.applicationUrl,
    source: (SOURCES as readonly string[]).includes(f.source) ? f.source : "",
    externalId: f.externalId,
    description: f.description,
    salaryMin: num(f.salaryMin),
    salaryMax: num(f.salaryMax),
    salaryCurrency: f.salaryCurrency,
    salaryPeriod: f.salaryPeriod,
    status: "saved",
    // The tracker has no free-text salary column, so unparsed salary text is kept as the first note.
    ...(salary ? { note: `Salary listed: ${f.salaryText.trim()}` } : {}),
  }
}

/** Same payload, same key: a retry after a lost response returns the job already created. */
export async function idempotencyKey(scope: string, input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(scope + "\n" + JSON.stringify(input))
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return "ext-" + [...hash.subarray(0, 20)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
