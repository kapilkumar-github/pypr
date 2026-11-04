export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE"

/** Browser-side JSON client for the same-origin `/api` proxy. */
export async function api<T>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
  const mutating = method !== "GET"
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    // The API requires JSON on every mutating request (CSRF guard), even when there is no payload.
    headers: mutating ? { "Content-Type": "application/json" } : undefined,
    body: mutating ? JSON.stringify(body ?? {}) : undefined,
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err = json?.error
    throw new ApiError(res.status, err?.code ?? "unknown", err?.message ?? "Something went wrong.", err?.fields)
  }
  return json as T
}

export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {}
}

export function errorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof ApiError) return Object.keys(error.fields).length ? null : error.message
  return "Can't reach the server. Check your connection and try again."
}
