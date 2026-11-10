import { SiteConfigSchema, SettingsSchema, DEFAULT_SETTINGS, UserSchema, JobFormSchema, type Settings, type SiteConfig, type User, type JobForm, MAX } from "./schema"
import { z } from "zod"

/** The slice of chrome.storage.local the extension uses. Tests pass a map-backed fake. */
export interface Area {
  get(keys: string | string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

export const AuthSchema = z.object({ token: z.string().min(10).max(200), expiresAt: z.string(), user: UserSchema })
export type Auth = z.infer<typeof AuthSchema>

export const DraftSchema = z.object({
  form: JobFormSchema,
  /** Fields the user typed into, so a rescan won't overwrite them. */
  edited: z.array(z.string().max(30)).max(20),
  savedJobId: z.string().max(60).optional(),
  /** Identifies one capture-and-save intent. Retries share it (so a lost response can't duplicate the job); a new capture gets a new one. */
  attempt: z.string().regex(/^[0-9a-f]{16}$/).optional(),
  updatedAt: z.number(),
})
export type Draft = z.infer<typeof DraftSchema>

const MAX_DRAFTS = 40

/** Data is kept per account (or "anon" when signed out), so switching accounts shows each its own mappings and drafts. */
export type Scope = string
export const scopeOf = (user: User | null | undefined): Scope => (user ? `u:${user.id}` : "anon")

export class VersionConflict extends Error {
  constructor() {
    super("This site was changed somewhere else. Reload and try again.")
  }
}

export class Store {
  constructor(private area: Area, private now: () => number = Date.now) {}

  async auth(): Promise<Auth | null> {
    const r = AuthSchema.safeParse((await this.area.get("auth")).auth)
    if (!r.success) return null
    return Date.parse(r.data.expiresAt) > this.now() ? r.data : null
  }
  setAuth(a: Auth) { return this.area.set({ auth: a }) }
  clearAuth() { return this.area.remove("auth") }

  async scope(): Promise<Scope> {
    return scopeOf((await this.auth())?.user)
  }

  async settings(): Promise<Settings> {
    const r = SettingsSchema.safeParse((await this.area.get("settings")).settings ?? {})
    return r.success ? r.data : DEFAULT_SETTINGS
  }
  setSettings(s: Settings) { return this.area.set({ settings: SettingsSchema.parse(s) }) }

  async configs(scope: Scope): Promise<SiteConfig[]> {
    const raw = (await this.area.get(`configs:${scope}`))[`configs:${scope}`]
    if (!Array.isArray(raw)) return []
    // One damaged entry must not hide the rest.
    return raw.flatMap((c) => {
      const r = SiteConfigSchema.safeParse(c)
      return r.success ? [r.data] : []
    })
  }

  /**
   * Saves a configuration with an optimistic version check: `expected` is the version the editor loaded
   * (null for a new one). The stored version goes up by one on every save.
   */
  async saveConfig(scope: Scope, config: SiteConfig, expected: number | null): Promise<SiteConfig> {
    const all = await this.configs(scope)
    const i = all.findIndex((c) => c.id === config.id)
    if (i >= 0 && expected !== all[i]!.version) throw new VersionConflict()
    if (i < 0 && all.length >= MAX.configs) throw new Error("Too many saved sites. Delete some first.")
    const saved: SiteConfig = { ...config, bundled: undefined, version: (i >= 0 ? all[i]!.version : 0) + 1, updatedAt: new Date(this.now()).toISOString() }
    if (i >= 0) all[i] = saved
    else all.push(saved)
    await this.area.set({ [`configs:${scope}`]: all })
    return saved
  }

  async deleteConfig(scope: Scope, id: string): Promise<void> {
    const all = (await this.configs(scope)).filter((c) => c.id !== id)
    await this.area.set({ [`configs:${scope}`]: all })
  }

  private async drafts(scope: Scope): Promise<Record<string, Draft>> {
    const raw = (await this.area.get(`drafts:${scope}`))[`drafts:${scope}`]
    const out: Record<string, Draft> = {}
    if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) {
      const r = DraftSchema.safeParse(v)
      if (r.success) out[k] = r.data
    }
    return out
  }
  async draft(scope: Scope, key: string): Promise<Draft | null> {
    return (await this.drafts(scope))[key] ?? null
  }
  async putDraft(scope: Scope, key: string, d: Omit<Draft, "updatedAt">): Promise<void> {
    const all = await this.drafts(scope)
    all[key] = { ...d, updatedAt: this.now() }
    const keep = Object.entries(all).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, MAX_DRAFTS)
    await this.area.set({ [`drafts:${scope}`]: Object.fromEntries(keep) })
  }
  async deleteDraft(scope: Scope, key: string): Promise<void> {
    const all = await this.drafts(scope)
    delete all[key]
    await this.area.set({ [`drafts:${scope}`]: all })
  }

  /** After a first sign-in, mappings made while signed out move to the account if it has none yet. */
  async adoptAnonymous(scope: Scope): Promise<void> {
    if (scope === "anon") return
    const [mine, anon] = [await this.configs(scope), await this.configs("anon")]
    if (mine.length === 0 && anon.length > 0) {
      await this.area.set({ [`configs:${scope}`]: anon })
      await this.area.remove("configs:anon")
    }
  }

  /** Removes every local record for one scope (used by "disconnect and remove local data"). */
  async wipe(scope: Scope): Promise<void> {
    await this.area.remove([`configs:${scope}`, `drafts:${scope}`])
  }
}

export type { JobForm }
