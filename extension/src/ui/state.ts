import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { waitFor } from "@/content/wait"
import { lastCapture, proposeFor } from "@/content/capture"
import { startPicker, type Picker } from "@/content/picker"
import { addPattern, clearMapping, createConfig, sameConfig, setPatternShape, upsertMapping } from "@/lib/configs"
import { extract, limitations, missing, readElement, toForm, type Extraction, type FieldFailure } from "@/lib/extract"
import { FIELD_LABEL, emptyForm, type Field, type FieldMapping, type JobForm, type PagePattern, type SiteConfig } from "@/lib/schema"
import { generate, mappingFor, type Generated } from "@/lib/selector"
import { jobKey, parseUrl } from "@/lib/urlpattern"
import { rpc, type Duplicate, type ResolveInfo, type SessionInfo } from "@/lib/rpc"
import type { Draft } from "@/lib/storage"
import type { TabMessage } from "@/lib/messages"

export type Tab = "job" | "mapping"

export interface Pending {
  field: Field
  el: Element
  origin: "menu" | "picker"
  note?: string
  /** Elements below this one that the user came up from, so "Child" can go back down. */
  below: Element[]
}

export interface PendingView {
  gen: Generated | null
  mapping: FieldMapping | null
  value?: string
  failure?: FieldFailure
}

export interface Notice {
  id: number
  tone: "info" | "warn" | "bad" | "good"
  text: string
}

export type SavePhase = { kind: "idle" } | { kind: "checking" } | { kind: "duplicates"; items: Duplicate[] } | { kind: "saving" } | { kind: "saved"; id: string; applied: boolean } | { kind: "confirm-applied"; id: string } | { kind: "marking"; id: string }

const FORM_FIELD: Record<Field, keyof JobForm> = {
  title: "title", company: "company", location: "location", arrangement: "workArrangement", employmentType: "employmentType", salary: "salaryText", description: "description", applicationUrl: "applicationUrl",
}

export function useUrl(): string {
  const [url, setUrl] = useState(location.href)
  useEffect(() => {
    const read = () => setUrl((u) => (u === location.href ? u : location.href))
    const nav = (window as unknown as { navigation?: EventTarget }).navigation
    window.addEventListener("popstate", read)
    window.addEventListener("hashchange", read)
    nav?.addEventListener("currententrychange", read)
    // Some sites rewrite the URL without an event the page world can't share; a light check covers them.
    const t = setInterval(read, 1000)
    return () => {
      window.removeEventListener("popstate", read)
      window.removeEventListener("hashchange", read)
      nav?.removeEventListener("currententrychange", read)
      clearInterval(t)
    }
  }, [])
  return url
}

let noticeSeq = 0
const newAttempt = (): string => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("")

export function usePanel(open: boolean) {
  const url = useUrl()
  const urlObj = useMemo(() => parseUrl(url), [url])
  const [tick, setTick] = useState(0)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [info, setInfo] = useState<ResolveInfo | null>(null)
  const [prefer, setPrefer] = useState<{ configId: string; patternId: string } | undefined>()
  const [tab, setTab] = useState<Tab>("job")
  const [notices, setNotices] = useState<Notice[]>([])

  // site configuration: stored copy, working copy and an undo trail
  const [saved, setSaved] = useState<SiteConfig | null>(null)
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [patternId, setPatternId] = useState<string | null>(null)
  const [trail, setTrail] = useState<{ cfg: SiteConfig | null; form: JobForm; edited: string[] }[]>([])
  const [urlReviewed, setUrlReviewed] = useState(false)

  // the job
  const [form, setForm] = useState<JobForm>(() => emptyForm())
  const [edited, setEdited] = useState<Set<string>>(new Set())
  const [captured, setCaptured] = useState(false)
  const [attempt, setAttempt] = useState(() => newAttempt())
  const [extraction, setExtraction] = useState<Extraction | null>(null)
  const [busy, setBusy] = useState<"capture" | "mapping" | null>(null)
  const [phase, setPhase] = useState<SavePhase>({ kind: "idle" })
  const [errors, setErrors] = useState<Partial<Record<keyof JobForm, string>>>({})

  // picking
  const [pending, setPending] = useState<Pending | null>(null)
  const [picking, setPicking] = useState<Field | null>(null)
  const [hover, setHover] = useState<Element | null>(null)
  const picker = useRef<Picker | null>(null)

  const latest = useRef({ cfg, saved, form, edited, patternId })
  latest.current = { cfg, saved, form, edited, patternId }

  const note = useCallback((tone: Notice["tone"], text: string) => {
    const id = ++noticeSeq
    setNotices((n) => [...n.slice(-2), { id, tone, text }])
    if (tone !== "bad") setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 9000)
  }, [])
  const dismiss = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), [])

  const pattern: PagePattern | undefined = cfg?.patterns.find((p) => p.id === patternId)
  const unsaved = !!cfg && !cfg.bundled && !sameConfig(cfg, saved ?? undefined)
  const key = urlObj ? jobKey(urlObj, info?.match?.pattern) : ""

  // ---- account and site resolution
  // The account is only checked while the panel is open, so browsing an enabled site makes no network calls.
  useEffect(() => {
    if (!open) return
    let live = true
    rpc<SessionInfo>({ type: "session" }).then((s) => live && setSession(s), () => live && setSession(null))
    return () => { live = false }
  }, [tick, open])

  useEffect(() => {
    let live = true
    setInfo(null)
    rpc<ResolveInfo>({ type: "resolve", url, prefer }).then((r) => live && setInfo(r), () => live && setInfo({ kind: "none", autoLauncher: false, hasAccess: false }))
    return () => { live = false }
  }, [url, tick, prefer])

  // Adopt the stored configuration for this page unless the user has unsaved edits to the same site.
  useEffect(() => {
    if (!info) return
    const m = info.match
    const cur = latest.current
    if (m) {
      if (cur.cfg && !cur.cfg.bundled && cur.cfg.id === m.config.id && !sameConfig(cur.cfg, cur.saved ?? undefined)) {
        const pid = cur.cfg.patterns.some((p) => p.id === m.pattern.id) ? m.pattern.id : cur.patternId
        setPatternId(pid)
        return
      }
      setSaved(m.config.bundled ? null : m.config)
      setCfg(m.config)
      setPatternId(m.pattern.id)
      setUrlReviewed(true)
    } else if (cur.cfg && !cur.cfg.bundled && !sameConfig(cur.cfg, cur.saved ?? undefined) && urlObj && cur.cfg.hosts.some((h) => h.host === urlObj.hostname)) {
      // A site being set up stays while the user moves around it.
    } else {
      setSaved(null)
      setCfg(null)
      setPatternId(null)
      setUrlReviewed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  // ---- drafts follow the job page
  const loadedKey = useRef("")
  useEffect(() => {
    if (!info || !key) return
    if (loadedKey.current === key) return
    loadedKey.current = key
    let live = true
    setPending(null)
    setPhase({ kind: "idle" })
    setErrors({})
    setExtraction(null)
    rpc<Draft | null>({ type: "draft.get", key }).then((d) => {
      if (!live) return
      if (d) {
        setForm(d.form)
        setEdited(new Set(d.edited))
        setCaptured(true)
        setAttempt(d.attempt ?? newAttempt())
        if (d.savedJobId) setPhase({ kind: "saved", id: d.savedJobId, applied: false })
      } else {
        setForm(emptyForm())
        setEdited(new Set())
        setCaptured(false)
      }
    }, () => undefined)
    return () => { live = false }
  }, [info, key])

  // Unsaved edits survive the panel closing and the page reloading.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedJobId = phase.kind === "saved" || phase.kind === "confirm-applied" || phase.kind === "marking" ? phase.id : undefined
  useEffect(() => {
    if (!captured || !key || loadedKey.current !== key) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void rpc({ type: "draft.put", key, draft: { form, edited: [...edited], savedJobId, attempt } }).catch(() => undefined)
    }, 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [form, edited, captured, key, savedJobId, attempt])

  // ---- reading the page
  const read = useCallback((withPattern: PagePattern | undefined, ats?: string, params?: Record<string, string>): Extraction | null => {
    return urlObj ? extract(document, urlObj, { pattern: withPattern, ats, params }) : null
  }, [urlObj])

  /** Live status of every mapped field against the page as it is now. */
  const [status, setStatus] = useState<Extraction | null>(null)
  useEffect(() => {
    if (!pattern || tab !== "mapping") return
    const t = setTimeout(() => setStatus(read(pattern, cfg?.ats, info?.match?.params)), 150)
    return () => clearTimeout(t)
  }, [pattern, cfg, tab, read, info, url])

  /**
   * mode "first": fill the form from the page. "rescan": refresh every field the user hasn't typed into.
   * "replace": overwrite everything, including the user's edits.
   */
  const capture = useCallback(async (mode: "first" | "rescan" | "replace" = "first") => {
    if (!urlObj) return
    setBusy("capture")
    setPhase((p) => (p.kind === "saved" ? p : { kind: "idle" }))
    const run = () => read(pattern, cfg?.ats, info?.match?.params)
    // Pages that build their content with script get a short, bounded wait.
    const x = (await waitFor(() => { const r = run(); return r && (r.values.title || r.values.description) ? r : null }, 4000)) ?? run()
    setBusy(null)
    if (!x) return
    setExtraction(x)
    const fresh = toForm(x, urlObj, info?.match?.pattern ?? pattern)
    setForm((cur) => {
      if (mode === "first" || mode === "replace") return fresh
      const next = { ...cur }
      for (const k of Object.keys(fresh) as (keyof JobForm)[]) if (!edited.has(k)) (next as Record<string, unknown>)[k] = fresh[k]
      return next
    })
    if (mode !== "rescan") { setEdited(new Set()); setAttempt(newAttempt()) }
    setCaptured(true)
    if (x.notes.length) note("warn", x.notes[0]!)
    if (!x.values.title || !x.values.description) {
      const l = limitations(document)
      if (l.length) note("warn", l[0]!)
    }
  }, [urlObj, read, pattern, cfg, info, edited, note])

  const editField = useCallback((k: keyof JobForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setEdited((s) => new Set(s).add(k))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }, [])

  // ---- mapping
  const stopPicker = useCallback(() => {
    picker.current?.stop()
    picker.current = null
    setPicking(null)
    setHover(null)
  }, [])
  useEffect(() => stopPicker, [stopPicker])

  const beginPending = useCallback((field: Field, el: Element, origin: Pending["origin"], noteText?: string) => {
    stopPicker()
    setPending({ field, el, origin, note: noteText, below: [] })
    setTab("mapping")
    el.scrollIntoView?.({ block: "nearest", behavior: "smooth" })
  }, [stopPicker])

  const startPick = useCallback((field: Field) => {
    stopPicker()
    setPending(null)
    setPicking(field)
    setTab("mapping")
    picker.current = startPicker({
      onHover: setHover,
      onPick: (el) => beginPending(field, el, "picker"),
      onCancel: stopPicker,
    })
  }, [beginPending, stopPicker])

  /** The browser's right-click menu: Pypr → Use as → field. */
  const onMenu = useCallback((field: Field) => {
    const p = proposeFor(field, lastCapture())
    if (p.ok) return beginPending(field, p.el, "menu", p.note)
    note("warn", p.reason)
    if (p.pick) startPick(field)
  }, [beginPending, note, startPick])

  const moveUp = useCallback(() => setPending((p) => {
    const parent = p?.el.parentElement
    return p && parent && parent !== document.body && parent !== document.documentElement ? { ...p, el: parent, below: [...p.below, p.el] } : p
  }), [])
  const moveDown = useCallback(() => setPending((p) => (p && p.below.length ? { ...p, el: p.below[p.below.length - 1]!, below: p.below.slice(0, -1) } : p)), [])

  const pendingView: PendingView | null = useMemo(() => {
    if (!pending) return null
    const gen = generate(pending.el)
    if (!gen) return { gen: null, mapping: null, failure: { reason: "invalid", detail: "No reliable selector could be built for this element." } }
    const mapping = mappingFor(pending.field, pending.el, gen)
    const r = readElement(pending.field, pending.el, mapping, document)
    return { gen, mapping, value: r.ok ? r.value : undefined, failure: r.ok ? undefined : r.failure }
  }, [pending])

  const pushTrail = useCallback(() => {
    const c = latest.current
    setTrail((t) => [...t.slice(-19), { cfg: c.cfg, form: c.form, edited: [...c.edited] }])
  }, [])

  /** A bundled site is copied to the user's own configuration the first time they change it. */
  const editable = useCallback((): { cfg: SiteConfig; pid: string } | null => {
    if (!urlObj) return null
    const c = latest.current
    if (c.cfg && !c.cfg.bundled && c.patternId) return { cfg: c.cfg, pid: c.patternId }
    if (c.cfg?.bundled && c.patternId) {
      const copy: SiteConfig = { ...c.cfg, id: `site-${Math.random().toString(16).slice(2, 14)}`, bundled: undefined, version: 0, name: c.cfg.name }
      return { cfg: copy, pid: c.patternId }
    }
    const made = createConfig(urlObj)
    setUrlReviewed(false)
    return { cfg: made.config, pid: made.pattern.id }
  }, [urlObj])

  const confirmPending = useCallback(() => {
    if (!pending || !pendingView?.mapping) return
    const base = editable()
    if (!base) return
    pushTrail()
    // Upsert: this field's earlier selector and fallbacks are replaced; other fields are untouched.
    const next = upsertMapping(base.cfg, base.pid, pending.field, pendingView.mapping)
    setCfg(next)
    setPatternId(base.pid)
    // Remapping is explicit, so it refreshes this field's value in the form.
    if (pendingView.value !== undefined) {
      const fk = FORM_FIELD[pending.field]
      const fresh = pending.field === "arrangement" || pending.field === "salary" || pending.field === "employmentType"
        ? urlObj && toForm(extract(document, urlObj, { pattern: next.patterns.find((p) => p.id === base.pid) }), urlObj)[fk]
        : pendingView.value
      if (fresh !== undefined && fresh !== null) setForm((f) => ({ ...f, [fk]: fresh }))
      setEdited((s) => { const n = new Set(s); n.delete(fk); return n })
      setCaptured(true)
    }
    setPending(null)
  }, [pending, pendingView, editable, pushTrail, urlObj])

  const clearField = useCallback((field: Field) => {
    const c = latest.current
    if (!c.cfg || !c.patternId) return
    const base = editable()
    if (!base) return
    pushTrail()
    setCfg(clearMapping(base.cfg, base.pid, field))
  }, [editable, pushTrail])

  const undo = useCallback(() => {
    setTrail((t) => {
      const last = t[t.length - 1]
      if (!last) return t
      setCfg(last.cfg)
      setForm(last.form)
      setEdited(new Set(last.edited))
      return t.slice(0, -1)
    })
  }, [])

  const startSite = useCallback(() => {
    const base = editable()
    if (!base) return
    setCfg(base.cfg)
    setPatternId(base.pid)
    setTab("mapping")
  }, [editable])

  const changeShape = useCallback((shape: { path: string; query: PagePattern["query"] }) => {
    const c = latest.current
    if (!c.cfg || !c.patternId) return
    pushTrail()
    setCfg(setPatternShape(c.cfg, c.patternId, shape))
    setUrlReviewed(false)
  }, [pushTrail])

  const addLayout = useCallback((shape: { path: string; query: PagePattern["query"] }) => {
    const c = latest.current
    if (!c.cfg) return
    pushTrail()
    const r = addPattern(c.cfg, shape)
    setCfg(r.config)
    setPatternId(r.pattern.id)
    setUrlReviewed(false)
  }, [pushTrail])

  const patchConfig = useCallback((patch: Partial<Pick<SiteConfig, "name" | "hosts" | "ats">>) => {
    const c = latest.current
    if (!c.cfg) return
    setCfg({ ...c.cfg, ...patch })
  }, [])

  const saveMapping = useCallback(async () => {
    const c = latest.current
    if (!c.cfg) return
    setBusy("mapping")
    try {
      const out = await rpc<SiteConfig>({ type: "configs.save", config: c.cfg, expectedVersion: c.saved ? c.saved.version : null })
      setSaved(out)
      setCfg(out)
      setTrail([])
      note("good", "Mapping saved. Other jobs on matching pages will use it.")
      setTick((n) => n + 1)
    } catch (e) {
      note("bad", (e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [note])

  const discardMapping = useCallback(() => {
    setCfg(saved ?? (info?.match?.config.bundled ? info.match.config : null))
    if (!saved && !info?.match) setPatternId(null)
    setTrail([])
    setPending(null)
  }, [saved, info])

  const deleteSite = useCallback(async () => {
    if (!saved) return
    try {
      await rpc({ type: "configs.delete", id: saved.id })
      setSaved(null); setCfg(null); setPatternId(null)
      note("info", "Site removed.")
      setTick((n) => n + 1)
    } catch (e) {
      note("bad", (e as Error).message)
    }
  }, [saved, note])

  const choose = useCallback((c: { configId: string; patternId: string }) => setPrefer(c), [])

  // ---- saving the job
  const validate = useCallback((): boolean => {
    const m = missing(form)
    const e: Partial<Record<keyof JobForm, string>> = {}
    if (m.required.includes("Job title")) e.title = "Enter the job title."
    if (m.required.includes("Company")) e.company = "Enter the company."
    setErrors(e)
    return Object.keys(e).length === 0
  }, [form])

  const doSave = useCallback(async () => {
    setPhase({ kind: "saving" })
    try {
      const r = await rpc<{ id: string }>({ type: "job.save", form, attempt })
      setPhase({ kind: "saved", id: r.id, applied: false })
    } catch (e) {
      setPhase({ kind: "idle" })
      note("bad", (e as { code?: string }).code === "email_unverified" ? "Verify your email in Pypr, then save again." : (e as Error).message)
    }
  }, [form, attempt, note])

  const save = useCallback(async (force = false) => {
    if (!validate()) return
    if (!session?.user) {
      note("warn", "Connect your Pypr account to save.")
      return
    }
    if (!force) {
      setPhase({ kind: "checking" })
      try {
        const items = await rpc<Duplicate[]>({ type: "job.check", form })
        if (items.length) return setPhase({ kind: "duplicates", items })
      } catch (e) {
        // A failed check shouldn't block saving, but the user should know it didn't run.
        note("warn", `Couldn't check for duplicates (${(e as Error).message}).`)
      }
    }
    await doSave()
  }, [validate, session, form, doSave, note])

  const markApplied = useCallback(async (id: string) => {
    setPhase({ kind: "marking", id })
    try {
      await rpc({ type: "job.apply", id })
      setPhase({ kind: "saved", id, applied: true })
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === "already_applied") setPhase({ kind: "saved", id, applied: true })
      else {
        setPhase({ kind: "saved", id, applied: false })
        note("bad", (e as Error).message)
      }
    }
  }, [note])

  const connect = useCallback(async () => {
    try {
      setSession(await rpc<SessionInfo>({ type: "connect" }))
    } catch (e) {
      note("bad", (e as Error).message)
    }
  }, [note])

  const restart = useCallback(() => {
    void rpc({ type: "draft.delete", key }).catch(() => undefined)
    setForm(emptyForm())
    setEdited(new Set())
    setCaptured(false)
    setAttempt(newAttempt())
    setPhase({ kind: "idle" })
    setExtraction(null)
  }, [key])

  /** Messages from the background worker: refresh after config or account changes; right-click menu choices. */
  const onTabMessage = useCallback((m: TabMessage) => {
    if (m.type === "refresh") setTick((n) => n + 1)
    else if (m.type === "menu.use") onMenu(m.field)
    else if (m.type === "notice") note("info", m.text)
  }, [onMenu, note])

  return {
    url, urlObj, tick, session, info, tab, setTab, notices, dismiss, note,
    saved, cfg, pattern, patternId, setPatternId, unsaved, trail, urlReviewed, setUrlReviewed,
    form, edited, captured, extraction, busy, phase, setPhase, errors, status,
    pending, pendingView, picking, hover, key,
    capture, editField, startPick, stopPicker, onMenu, moveUp, moveDown, confirmPending, cancelPending: () => setPending(null),
    clearField, undo, startSite, changeShape, addLayout, patchConfig, saveMapping, discardMapping, deleteSite, choose,
    save, markApplied, connect, restart, refresh: () => setTick((n) => n + 1), onTabMessage,
  }
}

export type Panel = ReturnType<typeof usePanel>
