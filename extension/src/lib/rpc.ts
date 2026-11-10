import type { Request, Reply } from "./messages"
import type { PagePattern, SiteConfig, User } from "./schema"
import type { Draft } from "./storage"
import type { Duplicate, SavedJob } from "./api"

export interface SessionInfo {
  user: User | null
  /** The account could not be checked just now (offline); the stored one is shown. */
  stale: boolean
  webOrigin: string
  apiOrigin: string
}

export interface MatchInfo {
  config: SiteConfig
  pattern: PagePattern
  params: Record<string, string>
}

export interface ResolveInfo {
  kind: "none" | "match" | "conflict"
  match?: MatchInfo
  /** Equally specific candidates when kind is "conflict". */
  choices?: { configId: string; patternId: string; name: string; path: string }[]
  autoLauncher: boolean
  hasAccess: boolean
}

export interface ConfigList {
  configs: SiteConfig[]
  bundled: SiteConfig[]
}

export interface SaveResult {
  id: string
  duplicateOf?: undefined
}

export type { Draft, Duplicate, SavedJob }

/** Sends a request to the background worker. Rejects with the worker's message when it refuses. */
export async function rpc<T = unknown>(req: Request): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(req)) as Reply<T> | undefined
  if (!reply) throw new Error("The extension didn't answer. Reload the page and try again.")
  if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code })
  return reply.data
}
