import { describe, expect, it, vi } from "vitest"
import { apiUrl, call, idempotencyKey, jobInput } from "../api"
import { authorizeUrl, begin, challengeFor, parseCallback, randomString, TRANSACTION_TTL_MS } from "../auth"
import { authorize, parseRequest, type SenderLike } from "../messages"
import { emptyForm } from "../schema"
import { Store, VersionConflict, scopeOf, type Area } from "../storage"
import { createConfig } from "../configs"

const ID = "ecfmagaellmkoicfndnhimjbjnlacfae"
const SELF = `chrome-extension://${ID}`

describe("message validation", () => {
  it("accepts known messages and rejects the rest", () => {
    expect(parseRequest({ type: "session" }).ok).toBe(true)
    expect(parseRequest({ type: "fetch", url: "https://evil.example" }).ok).toBe(false)
    expect(parseRequest({ type: "job.apply", id: 5 }).ok).toBe(false)
    expect(parseRequest(null).ok).toBe(false)
    expect(parseRequest({ type: "draft.get", key: "" }).ok).toBe(false)
  })
  it("rejects oversized payloads", () => {
    const big = { type: "draft.put", key: "k", draft: { form: { ...emptyForm(), description: "x".repeat(2_000_000) }, edited: [] } }
    expect(parseRequest(big).ok).toBe(false)
  })
  it("rejects a form that breaks its limits", () => {
    expect(parseRequest({ type: "job.save", form: { ...emptyForm(), title: "x".repeat(301) } }).ok).toBe(false)
  })
  it("has no generic proxy message", () => {
    expect(parseRequest({ type: "api", path: "/api/auth/me" }).ok).toBe(false)
  })
})

describe("sender checks", () => {
  const req = (type: string) => parseRequest({ type, ...(type === "connect" ? {} : {}) }) as { ok: true; req: never }
  const content: SenderLike = { id: ID, url: "https://jobs.example.com/x", tab: { id: 4 }, frameId: 0 }
  it("lets the top frame of a tab use panel messages", () => {
    expect(authorize(content, ID, SELF, req("session").req)).toBe("content")
  })
  it("refuses subframes, other extensions and tab-less senders", () => {
    expect(authorize({ ...content, frameId: 3 }, ID, SELF, req("session").req)).toBeNull()
    expect(authorize({ ...content, id: "otherextensionidxxxxxxxxxxxxxxxx" }, ID, SELF, req("session").req)).toBeNull()
    expect(authorize({ id: ID, url: "https://x.com" }, ID, SELF, req("session").req)).toBeNull()
  })
  it("keeps account and access management for extension pages", () => {
    const disconnect = parseRequest({ type: "disconnect" })
    expect(disconnect.ok && authorize(content, ID, SELF, disconnect.req)).toBeNull()
    const page: SenderLike = { id: ID, url: `${SELF}/options.html` }
    expect(disconnect.ok && authorize(page, ID, SELF, disconnect.req)).toBe("extension-page")
    expect(authorize({ id: ID, url: `${SELF}.evil.com/x` }, ID, SELF, req("session").req)).toBeNull()
  })
})

describe("account connection (PKCE)", () => {
  const redirect = `https://${ID}.chromiumapp.org/pypr`
  it("builds a request bound to a challenge of the verifier", async () => {
    const { txn, challenge } = await begin(redirect, 1000)
    expect(challenge).toBe(await challengeFor(txn.verifier))
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(txn.state.length).toBeGreaterThanOrEqual(16)
    expect(txn.verifier.length).toBeGreaterThanOrEqual(43)
    const u = new URL(authorizeUrl("https://www.pypr.work", txn, challenge))
    expect(u.pathname).toBe("/extension/connect")
    expect(u.searchParams.get("redirect_uri")).toBe(redirect)
    expect(u.searchParams.get("state")).toBe(txn.state)
    expect(u.href).not.toContain(txn.verifier)
  })
  it("accepts only the expected callback", async () => {
    const { txn } = await begin(redirect, 1000)
    const ok = `${redirect}?code=abc123&state=${txn.state}`
    expect(parseCallback(ok, txn, 2000)).toEqual({ ok: true, code: "abc123" })
    expect(parseCallback(`${redirect}?code=abc&state=wrong`, txn, 2000)).toMatchObject({ ok: false, reason: "mismatch" })
    expect(parseCallback(`${redirect}?code=abc`, txn, 2000)).toMatchObject({ ok: false, reason: "mismatch" })
    expect(parseCallback(`https://${ID}.chromiumapp.org/other?code=abc&state=${txn.state}`, txn, 2000)).toMatchObject({ reason: "mismatch" })
    expect(parseCallback(`https://evil.example/pypr?code=abc&state=${txn.state}`, txn, 2000)).toMatchObject({ reason: "mismatch" })
    expect(parseCallback(`${redirect}?error=access_denied&state=${txn.state}`, txn, 2000)).toMatchObject({ reason: "denied" })
    expect(parseCallback(`${redirect}?state=${txn.state}`, txn, 2000)).toMatchObject({ reason: "invalid" })
    expect(parseCallback(ok, txn, 1000 + TRANSACTION_TTL_MS + 1)).toMatchObject({ reason: "expired" })
    expect(parseCallback(ok, undefined)).toMatchObject({ reason: "invalid" })
    expect(parseCallback(undefined, txn, 2000)).toMatchObject({ reason: "invalid" })
  })
  it("makes unguessable values", () => expect(randomString()).not.toBe(randomString()))
})

describe("API client", () => {
  it("only talks to the listed API origin", () => {
    expect(apiUrl("/api/auth/me", "https://api.pypr.work", ["https://api.pypr.work"])).toBe("https://api.pypr.work/api/auth/me")
    expect(() => apiUrl("/api/x", "https://evil.example", ["https://api.pypr.work"])).toThrow()
    expect(() => apiUrl("//evil.example/api/x", "https://api.pypr.work", ["https://api.pypr.work"])).toThrow()
    expect(() => apiUrl("https://evil.example/api/x", "https://api.pypr.work", ["https://api.pypr.work"])).toThrow()
    expect(() => apiUrl("/other", "https://api.pypr.work", ["https://api.pypr.work"])).toThrow()
    expect(() => apiUrl("/api/../x", "https://api.pypr.work", ["https://api.pypr.work"])).toThrow()
    expect(() => apiUrl("/api/x", "http://api.pypr.work", ["http://api.pypr.work"])).toThrow(/https/)
    expect(apiUrl("/api/x", "http://localhost:8080", ["http://localhost:8080"])).toBe("http://localhost:8080/api/x")
  })
  it("sends the bearer token without cookies and maps errors", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: "x", message: "Nope." } }), { status: 422 }))
    await expect(call({ token: "tok", base: "https://a.test", allowed: ["https://a.test"], fetch: f as never }, "POST", "/api/tracked-jobs", {})).rejects.toMatchObject({ status: 422, message: "Nope." })
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok")
    expect(init.credentials).toBe("omit")
    expect(init.redirect).toBe("error")
  })
  it("derives a stable idempotency key per account and payload", async () => {
    const a = await idempotencyKey("u:1", { t: 1 })
    expect(a).toBe(await idempotencyKey("u:1", { t: 1 }))
    expect(a).not.toBe(await idempotencyKey("u:2", { t: 1 }))
    expect(a).not.toBe(await idempotencyKey("u:1", { t: 2 }))
    expect(a).toMatch(/^ext-[0-9a-f]{40}$/)
  })
  it("builds the save payload without inventing anything", () => {
    const f = { ...emptyForm("https://a.com/j/1"), title: "T", company: "C", salaryText: "Competitive", source: "bogus" }
    const p = jobInput(f)
    expect(p).toMatchObject({ title: "T", company: "C", source: "", status: "saved", salaryMin: null, note: "Salary listed: Competitive" })
    expect(p).not.toHaveProperty("userId")
    expect(p).not.toHaveProperty("appliedAt")
  })
})

function memory(): Area & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {}
  return {
    data,
    async get(k) { return Object.fromEntries((Array.isArray(k) ? k : [k]).filter((x) => x in data).map((x) => [x, structuredClone(data[x])])) },
    async set(items) { Object.assign(data, structuredClone(items)) },
    async remove(k) { for (const x of Array.isArray(k) ? k : [k]) delete data[x] },
  }
}
const user = (id: string) => ({ id, name: "A", email: "a@x.com", emailVerified: true })
const auth = (id: string) => ({ token: "t".repeat(40), expiresAt: new Date(Date.now() + 1e9).toISOString(), user: user(id) })

describe("storage", () => {
  const { config } = createConfig(new URL("https://a.com/jobs/12"))

  it("persists configs and versions them", async () => {
    const area = memory()
    const s = new Store(area)
    const first = await s.saveConfig("anon", config, null)
    expect(first.version).toBe(1)
    const reopened = new Store(area) // a new worker or a restarted browser
    expect((await reopened.configs("anon"))[0]!.id).toBe(config.id)
    const second = await reopened.saveConfig("anon", { ...first, name: "Renamed" }, 1)
    expect(second.version).toBe(2)
    await expect(reopened.saveConfig("anon", { ...first, name: "Stale" }, 1)).rejects.toBeInstanceOf(VersionConflict)
  })

  it("keeps each account's mappings and drafts to itself", async () => {
    const s = new Store(memory())
    await s.saveConfig(scopeOf(user("1")), config, null)
    await s.putDraft(scopeOf(user("1")), "a.com/jobs/12", { form: { ...(await import("../schema")).emptyForm(), title: "Mine" }, edited: ["title"] })
    expect(await s.configs(scopeOf(user("2")))).toEqual([])
    expect(await s.draft(scopeOf(user("2")), "a.com/jobs/12")).toBeNull()
    expect(await s.configs("anon")).toEqual([])
    expect((await s.draft(scopeOf(user("1")), "a.com/jobs/12"))!.form.title).toBe("Mine")
  })

  it("follows the signed-in account and expires old credentials", async () => {
    const area = memory()
    const s = new Store(area)
    expect(await s.scope()).toBe("anon")
    await s.setAuth(auth("7"))
    expect(await s.scope()).toBe("u:7")
    await s.setAuth({ ...auth("7"), expiresAt: new Date(Date.now() - 1000).toISOString() })
    expect(await s.scope()).toBe("anon")
    await s.setAuth(auth("8"))
    await s.clearAuth()
    expect(await s.auth()).toBeNull()
  })

  it("moves signed-out mappings to an account that has none", async () => {
    const s = new Store(memory())
    await s.saveConfig("anon", config, null)
    await s.adoptAnonymous("u:1")
    expect((await s.configs("u:1")).length).toBe(1)
    expect(await s.configs("anon")).toEqual([])
    await s.saveConfig("anon", { ...config, id: "other" }, null)
    await s.adoptAnonymous("u:1") // already has data: not merged
    expect((await s.configs("anon")).length).toBe(1)
  })

  it("ignores a damaged entry and keeps the rest", async () => {
    const area = memory()
    const s = new Store(area)
    await s.saveConfig("anon", config, null)
    ;(area.data["configs:anon"] as unknown[]).push({ nonsense: true })
    expect((await s.configs("anon")).length).toBe(1)
  })

  it("deletes a configuration and prunes old drafts", async () => {
    const s = new Store(memory())
    await s.saveConfig("anon", config, null)
    await s.deleteConfig("anon", config.id)
    expect(await s.configs("anon")).toEqual([])
    for (let i = 0; i < 50; i++) await s.putDraft("anon", "k" + i, { form: emptyForm(), edited: [] })
    expect(await s.draft("anon", "k0")).toBeNull()
    expect(await s.draft("anon", "k49")).not.toBeNull()
  })
})

describe("job.save message", () => {
  it("needs a capture attempt id so retries and deliberate duplicates differ", () => {
    expect(parseRequest({ type: "job.save", form: emptyForm() }).ok).toBe(false)
    expect(parseRequest({ type: "job.save", form: emptyForm(), attempt: "zz" }).ok).toBe(false)
    expect(parseRequest({ type: "job.save", form: emptyForm(), attempt: "0123456789abcdef" }).ok).toBe(true)
  })
})
