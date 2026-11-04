import "server-only"

import { normalizeResume } from "@/lib/resume/defaults"
import type { ResumeData } from "@/lib/resume/types"

const backendURL = process.env.BACKEND_URL ?? "http://localhost:8080"

/** The resume behind a short-lived render token (minted by the API for its headless Chrome), or null. */
export async function getRenderResume(id: string, token: string): Promise<{ title: string; data: ResumeData } | null> {
  if (!token) return null
  const res = await fetch(`${backendURL}/api/render/resumes/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`render resume: ${res.status}`)
  const json = (await res.json()) as { title: string; data: unknown }
  return { title: json.title, data: normalizeResume(json.data) }
}
