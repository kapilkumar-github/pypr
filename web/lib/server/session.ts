import "server-only"

import { cookies } from "next/headers"

import type { User } from "@/lib/api/auth"

export const SESSION_COOKIE = "pypr_session"
const backendURL = process.env.BACKEND_URL ?? "http://localhost:8080"

/** Validates the session cookie against the API. Returns null when signed out or the session is stale. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const res = await fetch(`${backendURL}/api/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Session check failed: ${res.status}`)
  return res.json()
}
