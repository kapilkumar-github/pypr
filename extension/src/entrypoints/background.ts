import { BUNDLED_SITES } from "@/lib/adapters"
import { ApiError, API_ORIGINS, WEB_ORIGIN, call, idempotencyKey, jobInput, type Duplicate, type SavedJob } from "@/lib/api"
import { authorizeUrl, begin, parseCallback } from "@/lib/auth"
import { validateConfig } from "@/lib/configs"
import { FIELD_LABEL, FIELDS, UserSchema, type Field, type SiteConfig } from "@/lib/schema"
import { authorize, parseRequest, type Reply, type Request, type TabMessage } from "@/lib/messages"
import type { ConfigList, ResolveInfo, SessionInfo } from "@/lib/rpc"
import { Store, VersionConflict } from "@/lib/storage"
import { REG_ID, planRegistration } from "@/lib/registration"
import { hostMatches, originPatterns, parseUrl, resolve } from "@/lib/urlpattern"

const CONTENT_FILE = "content-scripts/content.js"
const store = new Store(chrome.storage.local)
const SELF_ORIGIN = `chrome-extension://${chrome.runtime.id}`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class Refusal extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

// ---- account

async function client() {
  return { token: (await store.auth())?.token ?? null }
}

/** Calls the API as the connected user. A rejected credential signs the extension out. */
async function api<T>(method: "GET" | "POST", path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  try {
    return await call<T>(await client(), method, path, body, headers)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await store.clearAuth()
      await syncRegistrations()
      await notifyTabs({ type: "refresh" })
      throw new Refusal("unauthenticated", "Your Pypr connection ended. Connect again.")
    }
    throw e
  }
}

async function session(): Promise<SessionInfo> {
  const base = { webOrigin: WEB_ORIGIN, apiOrigin: API_ORIGINS[0]! }
  const auth = await store.auth()
  if (!auth) return { user: null, stale: false, ...base }
  try {
    // The account may have changed or been revoked since the token was issued.
    const me = UserSchema.parse(await api("GET", "/api/auth/me"))
    if (me.id !== auth.user.id) throw new Refusal("unauthenticated", "Account changed.")
    await store.setAuth({ ...auth, user: me })
    return { user: me, stale: false, ...base }
  } catch (e) {
    if (e instanceof Refusal) return { user: null, stale: false, ...base }
    return { user: auth.user, stale: true, ...base }
  }
}

let connecting: Promise<SessionInfo> | null = null
/** One sign-in at a time, however many panels ask. */
function connect(): Promise<SessionInfo> {
  connecting ??= doConnect().finally(() => { connecting = null })
  return connecting
}

async function doConnect(): Promise<SessionInfo> {
  const redirectUri = chrome.identity.getRedirectURL("pypr")
  const { txn, challenge } = await begin(redirectUri)
  // Kept in session storage so a worker restart during the sign-in doesn't lose it.
  await chrome.storage.session.set({ txn })
  let returned: string | undefined
  try {
    returned = await chrome.identity.launchWebAuthFlow({ url: authorizeUrl(WEB_ORIGIN, txn, challenge), interactive: true })
  } catch {
    await chrome.storage.session.remove("txn")
    throw new Refusal("cancelled", "Sign-in was closed before it finished.")
  }
  const saved = (await chrome.storage.session.get("txn")).txn as typeof txn | undefined
  await chrome.storage.session.remove("txn")
  const cb = parseCallback(returned, saved)
  if (!cb.ok) {
    const why = { denied: "You chose not to connect.", expired: "That sign-in took too long. Try again.", mismatch: "The sign-in response didn't match this request.", invalid: "The sign-in response was not valid." }[cb.reason]
    throw new Refusal("connect_failed", why)
  }
  const res = await call<{ token: string; expiresAt: string; user: unknown }>({ token: null }, "POST", "/api/ext/token", { code: cb.code, verifier: txn.verifier, redirectUri })
  const user = UserSchema.parse(res.user)
  await store.setAuth({ token: res.token, expiresAt: res.expiresAt, user })
  await store.adoptAnonymous(`u:${user.id}`)
  await syncRegistrations()
  await notifyTabs({ type: "refresh" })
  return session()
}

async function disconnect(wipe: boolean): Promise<void> {
  const auth = await store.auth()
  if (auth) {
    try {
      await call({ token: auth.token }, "POST", "/api/auth/logout", {})
    } catch {
      /* The token is dropped locally either way; it expires on the server. */
    }
    if (wipe) await store.wipe(`u:${auth.user.id}`)
  }
  await store.clearAuth()
  await syncRegistrations()
  await notifyTabs({ type: "refresh" })
}

// ---- sites

async function allConfigs(): Promise<SiteConfig[]> {
  return [...BUNDLED_SITES, ...(await store.configs(await store.scope()))]
}

const withHostRules = (c: SiteConfig) => c.hosts.flatMap(originPatterns)

async function hasAccess(c: SiteConfig, host: string): Promise<boolean> {
  const rule = c.hosts.find((h) => hostMatches(h, host))
  return rule ? chrome.permissions.contains({ origins: originPatterns(rule) }) : false
}

async function resolveInfo(rawUrl: string, prefer?: { configId: string; patternId: string }): Promise<ResolveInfo> {
  const url = parseUrl(rawUrl)
  const settings = await store.settings()
  if (!url) return { kind: "none", autoLauncher: settings.autoLauncher, hasAccess: false }
  const r = resolve(await allConfigs(), url)
  if (r.kind === "none") return { kind: "none", autoLauncher: settings.autoLauncher, hasAccess: false }
  if (r.kind === "conflict") {
    const picked = prefer && r.matches.find((m) => m.config.id === prefer.configId && m.pattern.id === prefer.patternId)
    if (picked) return { kind: "match", match: { config: picked.config, pattern: picked.pattern, params: picked.params }, autoLauncher: settings.autoLauncher, hasAccess: await hasAccess(picked.config, url.hostname) }
    return {
      kind: "conflict",
      choices: r.matches.map((m) => ({ configId: m.config.id, patternId: m.pattern.id, name: m.config.name, path: m.pattern.path })),
      autoLauncher: settings.autoLauncher,
      hasAccess: false,
    }
  }
  const m = r.match
  return { kind: "match", match: { config: m.config, pattern: m.pattern, params: m.params }, autoLauncher: settings.autoLauncher, hasAccess: await hasAccess(m.config, url.hostname) }
}

/**
 * Keeps the automatic content script in step with what the user allowed: one registration covering exactly the
 * sites that are enabled, have a page pattern and have been granted site access. Revoked access disappears here too.
 */
let syncing: Promise<void> = Promise.resolve()
function syncRegistrations(): Promise<void> {
  syncing = syncing.then(doSync, doSync)
  return syncing
}
async function doSync(): Promise<void> {
  try {
    const settings = await store.settings()
    const configs = await allConfigs()
    const granted = new Set<string>()
    for (const p of new Set(configs.flatMap(withHostRules))) if (await chrome.permissions.contains({ origins: [p] })) granted.add(p)
    const plan = planRegistration(configs, (p) => granted.has(p), settings)
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [REG_ID] })
    if (!plan.matches) {
      if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [REG_ID] })
      return
    }
    const script = { id: REG_ID, js: [CONTENT_FILE], matches: plan.matches, runAt: "document_idle" as const, allFrames: false, persistAcrossSessions: true }
    if (existing.length) await chrome.scripting.updateContentScripts([script])
    else await chrome.scripting.registerContentScripts([script])
    // A registration only affects pages loaded from now on. Tabs that are already open (restored at startup, or open
    // when the user just enabled the site) get the script now, so the launcher appears without a reload.
    for (const tab of await chrome.tabs.query({ url: plan.matches })) {
      if (tab.id !== undefined) await ensureInjected(tab.id).catch(() => undefined)
    }
  } catch (e) {
    console.warn("pypr: could not sync content scripts", e)
  }
}

// ---- tabs

async function sendToTab(tabId: number, msg: TabMessage, frameId = 0): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, msg, { frameId })
}

async function notifyTabs(msg: TabMessage): Promise<void> {
  const tabs = await chrome.tabs.query({ url: ["https://*/*", "http://*/*"] })
  await Promise.all(tabs.map((t) => (t.id !== undefined ? sendToTab(t.id, msg).catch(() => undefined) : undefined)))
}

/** Makes sure this tab's top frame runs the panel script. Returns whether it had to be added. */
async function ensureInjected(tabId: number): Promise<"ready" | "injected"> {
  try {
    await sendToTab(tabId, { type: "ping" })
    return "ready"
  } catch {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [CONTENT_FILE] })
    return "injected"
  }
}

async function activate(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !parseUrl(tab.url ?? "")) {
    await chrome.action.setBadgeText({ text: "×" })
    setTimeout(() => void chrome.action.setBadgeText({ text: "" }), 2500)
    return
  }
  await ensureInjected(tab.id)
  await sendToTab(tab.id, { type: "panel.open" })
}

async function onMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const id = String(info.menuItemId)
  if (!id.startsWith("use:") || tab?.id === undefined) return
  const field = id.slice(4) as Field
  if (!FIELDS.includes(field)) return
  if (!parseUrl(tab.url ?? "")) return
  const state = await ensureInjected(tab.id)
  await sendToTab(tab.id, { type: "panel.open" })
  if ((info.frameId ?? 0) !== 0) {
    await sendToTab(tab.id, { type: "notice", text: "That element is inside a frame. Pypr reads the main page only, so it can't be mapped." })
  } else if (state === "injected") {
    // The page element can only be known to a script that was listening before the menu opened.
    await sendToTab(tab.id, { type: "notice", text: `Pypr is now active on this page. Right-click the element again and choose Pypr → Use as → ${FIELD_LABEL[field]}.` })
  } else {
    await sendToTab(tab.id, { type: "menu.use", field, selectionText: info.selectionText?.slice(0, 1000), frameId: 0 })
  }
}

function buildMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "pypr", title: "Pypr", contexts: ["all"] })
    chrome.contextMenus.create({ id: "pypr-use", parentId: "pypr", title: "Use as", contexts: ["all"] })
    for (const f of FIELDS) chrome.contextMenus.create({ id: `use:${f}`, parentId: "pypr-use", title: FIELD_LABEL[f], contexts: ["all"] })
  })
}

// ---- requests

async function findConfig(id: string): Promise<SiteConfig | undefined> {
  return (await allConfigs()).find((c) => c.id === id)
}

async function handle(req: Request, from: "content" | "extension-page"): Promise<unknown> {
  switch (req.type) {
    case "session": return session()
    case "connect": return connect()
    case "disconnect": return disconnect(req.wipe)
    case "resolve": return resolveInfo(req.url, req.prefer)
    case "configs.list": return { configs: await store.configs(await store.scope()), bundled: BUNDLED_SITES } satisfies ConfigList
    case "configs.save": {
      const v = validateConfig(req.config)
      if (!v.ok) throw new Refusal("invalid_config", v.error)
      const saved = await store.saveConfig(await store.scope(), v.config, req.expectedVersion)
      await syncRegistrations()
      await notifyTabs({ type: "refresh" })
      return saved
    }
    case "configs.delete":
      await store.deleteConfig(await store.scope(), req.id)
      await syncRegistrations()
      await notifyTabs({ type: "refresh" })
      return null
    case "settings.get": return store.settings()
    case "settings.set":
      await store.setSettings(req.settings)
      await syncRegistrations()
      await notifyTabs({ type: "refresh" })
      return req.settings
    case "access.status": {
      const c = await findConfig(req.configId)
      if (!c) throw new Refusal("not_found", "That site no longer exists.")
      const patterns = withHostRules(c)
      return { granted: patterns.length > 0 && (await chrome.permissions.contains({ origins: patterns })), patterns }
    }
    case "access.open": {
      if (!(await findConfig(req.configId))) throw new Refusal("not_found", "That site no longer exists.")
      await chrome.windows.create({ url: chrome.runtime.getURL(`options.html#/access/${encodeURIComponent(req.configId)}`), type: "popup", width: 520, height: 420 })
      return null
    }
    case "access.revoke": {
      const c = await findConfig(req.configId)
      if (c) await chrome.permissions.remove({ origins: withHostRules(c) })
      await syncRegistrations()
      return null
    }
    case "draft.get": return store.draft(await store.scope(), req.key)
    case "draft.put": await store.putDraft(await store.scope(), req.key, req.draft); return null
    case "draft.delete": await store.deleteDraft(await store.scope(), req.key); return null
    case "job.check": {
      const f = req.form
      const out = await api<{ duplicates: Duplicate[] }>("POST", "/api/tracked-jobs/duplicates", {
        discoveryUrl: f.discoveryUrl, applicationUrl: f.applicationUrl, source: f.source, externalId: f.externalId, company: f.company, title: f.title,
      })
      return out.duplicates
    }
    case "job.save": {
      if (!(await store.auth())) throw new Refusal("unauthenticated", "Connect your Pypr account first.")
      const input = jobInput(req.form)
      const key = await idempotencyKey(await store.scope(), { input, attempt: req.attempt })
      const saved = await api<SavedJob>("POST", "/api/tracked-jobs", input, { "Idempotency-Key": key })
      return { id: saved.id, status: saved.status, appliedAt: saved.appliedAt }
    }
    case "job.apply": {
      if (!UUID.test(req.id)) throw new Refusal("invalid", "Invalid job.")
      // An explicit user action in the panel. Opening or following an application link never gets here.
      const saved = await api<SavedJob>("POST", `/api/tracked-jobs/${req.id}/apply`, { resume: { kind: "none" } })
      return { id: saved.id, status: saved.status, appliedAt: saved.appliedAt }
    }
  }
  void from
}

function errorReply(e: unknown): Reply {
  if (e instanceof Refusal) return { ok: false, error: { code: e.code, message: e.message } }
  if (e instanceof VersionConflict) return { ok: false, error: { code: "conflict", message: e.message } }
  if (e instanceof ApiError) return { ok: false, error: { code: e.code, message: e.message } }
  console.warn("pypr:", e)
  return { ok: false, error: { code: "error", message: "Something went wrong. Try again." } }
}

export default defineBackground(() => {
  // Browser tests can't press the toolbar button or open the native menu; this lets them call the same handlers.
  if (import.meta.env.VITE_PYPR_TEST) (globalThis as unknown as { __pyprTest: unknown }).__pyprTest = { activate, onMenu, syncRegistrations }

  // Credentials and mappings stay out of reach of content scripts, which share a tab with page scripts.
  void chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" })

  chrome.runtime.onInstalled.addListener(() => {
    buildMenus()
    void syncRegistrations()
  })
  chrome.runtime.onStartup.addListener(() => void syncRegistrations())
  chrome.permissions.onAdded.addListener(() => void syncRegistrations())
  chrome.permissions.onRemoved.addListener(() => void syncRegistrations())
  chrome.action.onClicked.addListener((tab) => void activate(tab))
  chrome.contextMenus.onClicked.addListener((info, tab) => void onMenu(info, tab))

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const parsed = parseRequest(raw)
    if (!parsed.ok) {
      sendResponse({ ok: false, error: { code: "bad_request", message: parsed.error } } satisfies Reply)
      return false
    }
    const from = authorize(sender, chrome.runtime.id, SELF_ORIGIN, parsed.req)
    if (!from) {
      sendResponse({ ok: false, error: { code: "forbidden", message: "Not allowed from here." } } satisfies Reply)
      return false
    }
    handle(parsed.req, from).then(
      (data) => sendResponse({ ok: true, data: data ?? null } satisfies Reply),
      (e) => sendResponse(errorReply(e)),
    )
    return true
  })
})
