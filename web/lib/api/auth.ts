import { api } from "./client"

export type User = { id: string; name: string; email: string; createdAt: string }

export const authApi = {
  signup: (body: { name: string; email: string; password: string }) => api<User>("/auth/signup", "POST", body),
  login: (body: { email: string; password: string }) => api<User>("/auth/login", "POST", body),
  logout: () => api<void>("/auth/logout", "POST"),
  forgotPassword: (body: { email: string }) => api<void>("/auth/forgot-password", "POST", body),
  resetPassword: (body: { token: string; password: string }) => api<void>("/auth/reset-password", "POST", body),
}

/** Only same-site relative paths are allowed as post-login destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/resumes") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback
}
