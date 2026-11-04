import "server-only"

import { cache } from "react"

import { normalizeResume } from "@/lib/resume/defaults"
import type { ResumeData } from "@/lib/resume/types"

const backendURL = process.env.BACKEND_URL ?? "http://localhost:8080"

export type PublicResume = { title: string; data: ResumeData; allowDownload: boolean; indexable: boolean }

/**
 * A public resume by its address, or null when it doesn't exist or isn't public.
 * Each call counts a view, so it is memoized per request (metadata and page share one fetch).
 */
export const getPublicResume = cache(async (slug: string): Promise<PublicResume | null> => {
  if (!/^[a-z0-9-]{3,60}$/i.test(slug)) return null
  const res = await fetch(`${backendURL}/api/public/resumes/${encodeURIComponent(slug.toLowerCase())}`, { cache: "no-store" })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`public resume: ${res.status}`)
  const json = (await res.json()) as Omit<PublicResume, "data"> & { data: unknown }
  return { ...json, data: normalizeResume(json.data) }
})
