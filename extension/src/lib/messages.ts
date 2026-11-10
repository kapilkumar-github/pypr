import { z } from "zod"
import { FieldSchema, JobFormSchema, SettingsSchema, SiteConfigSchema } from "./schema"
import { DraftSchema } from "./storage"

// Every message into the background worker is parsed against this union. Nothing else is accepted, and there is
// no message that fetches an arbitrary URL.

const Key = z.string().min(1).max(500)

export const RequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session") }),
  z.object({ type: z.literal("connect") }),
  z.object({ type: z.literal("disconnect"), wipe: z.boolean().default(false) }),
  z.object({ type: z.literal("resolve"), url: z.string().max(2000), prefer: z.object({ configId: z.string().max(60), patternId: z.string().max(60) }).optional() }),
  z.object({ type: z.literal("configs.list") }),
  z.object({ type: z.literal("configs.save"), config: SiteConfigSchema, expectedVersion: z.number().int().nullable() }),
  z.object({ type: z.literal("configs.delete"), id: z.string().max(60) }),
  z.object({ type: z.literal("settings.get") }),
  z.object({ type: z.literal("settings.set"), settings: SettingsSchema }),
  z.object({ type: z.literal("access.status"), configId: z.string().max(60) }),
  z.object({ type: z.literal("access.open"), configId: z.string().max(60) }),
  z.object({ type: z.literal("access.revoke"), configId: z.string().max(60) }),
  z.object({ type: z.literal("draft.get"), key: Key }),
  z.object({ type: z.literal("draft.put"), key: Key, draft: DraftSchema.omit({ updatedAt: true }) }),
  z.object({ type: z.literal("draft.delete"), key: Key }),
  z.object({ type: z.literal("job.check"), form: JobFormSchema }),
  z.object({ type: z.literal("job.save"), form: JobFormSchema, attempt: z.string().regex(/^[0-9a-f]{16}$/) }),
  z.object({ type: z.literal("job.apply"), id: z.string().max(60) }),
])
export type Request = z.infer<typeof RequestSchema>

/** From the background to a tab's content script. */
export const TabMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("panel.open") }),
  z.object({ type: z.literal("menu.use"), field: FieldSchema, selectionText: z.string().max(1000).optional(), frameId: z.number().int() }),
  z.object({ type: z.literal("notice"), text: z.string().max(300) }),
  z.object({ type: z.literal("refresh") }),
])
export type TabMessage = z.infer<typeof TabMessageSchema>

export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export const MAX_MESSAGE_BYTES = 1_500_000

export interface SenderLike {
  id?: string
  url?: string
  tab?: { id?: number }
  frameId?: number
}

export type Origin = "content" | "extension-page"

/**
 * Who may send which message. Content scripts must be in a tab's top frame. Extension pages (options, the access
 * window) must be served from this extension. A content script can do everything a panel needs but cannot touch
 * account or access management, which belong to extension pages.
 */
const FROM_CONTENT = new Set<Request["type"]>(["session", "resolve", "configs.list", "configs.save", "configs.delete", "settings.get", "access.status", "access.open", "draft.get", "draft.put", "draft.delete", "job.check", "job.save", "job.apply", "connect"])

export function authorize(sender: SenderLike, selfId: string, selfOrigin: string, req: Request): Origin | null {
  if (sender.id !== selfId) return null
  if (sender.url?.startsWith(selfOrigin + "/")) return "extension-page"
  if (sender.tab?.id !== undefined && sender.frameId === 0 && FROM_CONTENT.has(req.type)) return "content"
  return null
}

export function parseRequest(raw: unknown): { ok: true; req: Request } | { ok: false; error: string } {
  let size = 0
  try {
    size = JSON.stringify(raw)?.length ?? 0
  } catch {
    return { ok: false, error: "Unreadable message." }
  }
  if (size > MAX_MESSAGE_BYTES) return { ok: false, error: "Message too large." }
  const r = RequestSchema.safeParse(raw)
  return r.success ? { ok: true, req: r.data } : { ok: false, error: "Unknown or malformed message." }
}

export const settingsDefault = SettingsSchema.parse({})
