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

const POLL_MS = 2000
const POLL_LIMIT_MS = 120_000

/**
 * Starts a background job (`POST start`, replies `{id}`) and polls `GET poll/{id}` until it's done.
 * Used for slow AI calls, which proxies in front of the API would cut off as one long request.
 */
export async function runJob<T>(start: string, poll: string, body: unknown): Promise<T> {
  const { id } = await api<{ id: string }>(start, "POST", body)
  const deadline = Date.now() + POLL_LIMIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const job = await api<{ status: "pending" } | ({ status: "done" } & T)>(`${poll}/${encodeURIComponent(id)}`)
    if (job.status === "done") return job as T
  }
  throw new ApiError(504, "timeout", "This is taking too long. Try again in a minute.")
}

export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {}
}

export function errorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof ApiError) return Object.keys(error.fields).length ? null : error.message
  return "Can't reach the server. Check your connection and try again."
}
