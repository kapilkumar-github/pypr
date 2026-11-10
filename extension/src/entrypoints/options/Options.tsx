import { useCallback, useEffect, useState } from "react"
import { clearMapping, removePattern, setPatternShape, addPattern, sameConfig } from "@/lib/configs"
import { FIELDS, FIELD_LABEL, type Settings, type SiteConfig } from "@/lib/schema"
import { originPatterns } from "@/lib/urlpattern"
import { rpc, type ConfigList, type SessionInfo } from "@/lib/rpc"
import { Badge, Button, Field, Input, Notice, PyprMark, Toggle } from "@/ui/kit"
import { UrlEditor } from "@/ui/UrlEditor"

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    load().then((d) => live && setData(d), () => undefined)
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return [data, () => setN((x) => x + 1)] as const
}

export function Options() {
  const [route, setRoute] = useState(location.hash)
  useEffect(() => {
    const f = () => setRoute(location.hash)
    window.addEventListener("hashchange", f)
    return () => window.removeEventListener("hashchange", f)
  }, [])
  const access = /^#\/access\/(.+)$/.exec(route)
  return access ? <Access id={decodeURIComponent(access[1]!)} /> : <Main />
}

function Main() {
  const [session, reloadSession] = useAsync(() => rpc<SessionInfo>({ type: "session" }), [])
  const [lists, reloadLists] = useAsync(() => rpc<ConfigList>({ type: "configs.list" }), [])
  const [settings, reloadSettings] = useAsync(() => rpc<Settings>({ type: "settings.get" }), [])
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null)
  const fail = (e: unknown) => setMsg({ tone: "bad", text: (e as Error).message })

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="flex items-center gap-3">
        <span className="text-primary"><PyprMark size={32} /></span>
        <div>
          <h1 className="text-xl font-semibold">Pypr job capture</h1>
          <p className="text-sm text-muted-foreground">Sites, mappings and your account connection. Everything here stays in this browser.</p>
        </div>
      </header>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}

      <section className="space-y-3" aria-labelledby="acct">
        <h2 id="acct" className="text-base font-semibold">Account</h2>
        {!session ? <p className="text-sm text-muted-foreground">Loading…</p> : session.user ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{session.user.name}</p>
              <p className="text-muted-foreground">{session.user.email}{session.stale ? " (not re-checked, offline)" : ""}</p>
            </div>
            <Button onClick={() => void rpc({ type: "disconnect", wipe: false }).then(() => { reloadSession(); reloadLists() }, fail)}>Disconnect</Button>
            <Button variant="danger" onClick={() => { if (confirm("Disconnect and delete this account's saved sites and drafts from this browser?")) void rpc({ type: "disconnect", wipe: true }).then(() => { reloadSession(); reloadLists() }, fail) }}>Disconnect and remove local data</Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <p className="text-sm">Not connected. Connecting opens the Pypr website to sign in and approve. The extension never sees your password.</p>
            <Button variant="primary" onClick={() => void rpc({ type: "connect" }).then(() => { reloadSession(); reloadLists() }, fail)}>Connect Pypr</Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Saved sites and drafts are kept per account. Switching accounts doesn&apos;t show one account&apos;s data to another.</p>
      </section>

      <section className="space-y-3" aria-labelledby="set">
        <h2 id="set" className="text-base font-semibold">Settings</h2>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 text-sm">
          <span>
            <span className="block font-medium">Show the floating icon automatically</span>
            <span className="text-muted-foreground">On job pages of sites you enabled. The toolbar icon always works.</span>
          </span>
          <Toggle label="Show the floating icon automatically" checked={settings?.autoLauncher ?? true} onChange={(v) => void rpc({ type: "settings.set", settings: { autoLauncher: v } }).then(reloadSettings, fail)} />
        </label>
      </section>

      <section className="space-y-3" aria-labelledby="sites">
        <h2 id="sites" className="text-base font-semibold">Your sites</h2>
        {lists && lists.configs.length === 0 && <p className="text-sm text-muted-foreground">No sites yet. Open a job page, click the toolbar icon and choose <em>Site &amp; mapping</em> to set one up.</p>}
        {lists?.configs.map((c) => <SiteCard key={c.id + c.version} config={c} onChanged={reloadLists} onError={fail} onDone={(t) => setMsg({ tone: "good", text: t })} />)}
        <NewSite onCreated={reloadLists} onError={fail} />
      </section>

      <section className="space-y-3" aria-labelledby="built">
        <h2 id="built" className="text-base font-semibold">Built-in sites</h2>
        <p className="text-sm text-muted-foreground">Recognized out of the box. They know the address shape of job pages, not the page layout, so you teach the layout yourself.</p>
        <ul className="space-y-2">{lists?.bundled.map((c) => <BuiltIn key={c.id} config={c} />)}</ul>
      </section>
    </main>
  )
}

function useAccess(c: SiteConfig) {
  const [granted, setGranted] = useState<boolean | null>(null)
  const refresh = useCallback(() => {
    rpc<{ granted: boolean }>({ type: "access.status", configId: c.id }).then((r) => setGranted(r.granted), () => setGranted(null))
  }, [c.id])
  useEffect(() => {
    refresh()
    chrome.permissions.onAdded.addListener(refresh)
    chrome.permissions.onRemoved.addListener(refresh)
    return () => {
      chrome.permissions.onAdded.removeListener(refresh)
      chrome.permissions.onRemoved.removeListener(refresh)
    }
  }, [refresh])
  const grant = async () => {
    // Called straight from a click, which is what lets the browser show its permission prompt.
    const origins = c.hosts.flatMap(originPatterns)
    const ok = await chrome.permissions.request({ origins })
    refresh()
    return ok
  }
  const revoke = () => rpc({ type: "access.revoke", configId: c.id }).then(refresh)
  return { granted, grant, revoke }
}

function AccessRow({ config }: { config: SiteConfig }) {
  const a = useAccess(config)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>
        {a.granted ? <Badge tone="good">Automatic icon on</Badge> : <Badge>Automatic icon off</Badge>}{" "}
        <span className="text-xs text-muted-foreground">{config.hosts.map((h) => h.host + (h.subdomains ? " + subdomains" : "")).join(", ")}</span>
      </span>
      {a.granted ? <Button small onClick={() => void a.revoke()}>Remove site access</Button> : <Button small variant="primary" onClick={() => void a.grant()}>Enable on this site</Button>}
    </div>
  )
}

function BuiltIn({ config }: { config: SiteConfig }) {
  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-3">
      <p className="font-medium">{config.name} <span className="font-mono text-xs text-muted-foreground">{config.patterns.map((p) => p.path).join("  ")}</span></p>
      <AccessRow config={config} />
    </li>
  )
}

function SiteCard({ config, onChanged, onError, onDone }: { config: SiteConfig; onChanged: () => void; onError: (e: unknown) => void; onDone: (t: string) => void }) {
  const [draft, setDraft] = useState(config)
  const [open, setOpen] = useState(false)
  const dirty = !sameConfig(draft, config)

  const save = () => rpc({ type: "configs.save", config: draft, expectedVersion: config.version }).then(() => { onDone(`Saved ${draft.name}.`); onChanged() }, onError)
  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="pp-focus min-w-0 flex-1 cursor-pointer text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="font-medium">{draft.name}</span>{" "}
          <span className="font-mono text-xs text-muted-foreground">{draft.hosts[0]?.host}{draft.patterns[0]?.path}</span>
          {dirty && <Badge tone="warn">unsaved</Badge>}
        </button>
        <label className="flex items-center gap-2 text-xs">
          Enabled <Toggle label={`Enable ${draft.name}`} checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
        </label>
      </div>
      <AccessRow config={config} />
      {open && (
        <div className="space-y-4 border-t border-border pt-3">
          <Field label="Name"><Input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Hosts" hint="Subdomains are matched only when you tick the box.">
            <div className="space-y-1">
              {draft.hosts.map((h, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <Input value={h.host} aria-label="Host" onChange={(e) => setDraft({ ...draft, hosts: draft.hosts.map((x, j) => (j === i ? { ...x, host: e.target.value.trim().toLowerCase() } : x)) })} />
                  <input type="checkbox" checked={h.subdomains} onChange={(e) => setDraft({ ...draft, hosts: draft.hosts.map((x, j) => (j === i ? { ...x, subdomains: e.target.checked } : x)) })} /> <span className="text-xs whitespace-nowrap">subdomains too</span>
                </label>
              ))}
            </div>
          </Field>
          {draft.patterns.map((p) => (
            <div key={p.id} className="space-y-3 rounded-md border border-border p-3">
              <UrlEditor pattern={p} current={null} host={draft.hosts[0]?.host ?? ""} onChange={(shape) => setDraft(setPatternShape(draft, p.id, shape))} />
              <ul className="space-y-1">
                {FIELDS.map((f) => {
                  const m = p.fields[f]
                  return (
                    <li key={f} className="flex items-center justify-between gap-2 text-xs">
                      <span className="w-32 shrink-0 font-medium">{FIELD_LABEL[f]}</span>
                      <code className="min-w-0 flex-1 truncate text-muted-foreground" title={m?.selector}>{m ? m.selector : "not mapped"}</code>
                      {m && <Button small variant="danger" onClick={() => setDraft(clearMapping(draft, p.id, f))}>Clear</Button>}
                    </li>
                  )
                })}
              </ul>
              <Button small variant="danger" disabled={draft.patterns.length < 2} onClick={() => setDraft(removePattern(draft, p.id))}>Remove this layout</Button>
            </div>
          ))}
          <Button small onClick={() => setDraft(addPattern(draft, { path: "/jobs/:jobId", query: [] }).config)}>Add a layout</Button>
          <p className="text-xs text-muted-foreground">To change a selector, open a job page on this site and use <em>Remap</em> in the panel.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!dirty} onClick={() => void save()}>Save changes</Button>
            <Button disabled={!dirty} onClick={() => setDraft(config)}>Discard</Button>
            <Button variant="danger" onClick={() => { if (confirm(`Delete ${config.name} and its mappings?`)) void rpc({ type: "configs.delete", id: config.id }).then(onChanged, onError) }}>Delete site</Button>
          </div>
        </div>
      )}
    </article>
  )
}

function NewSite({ onCreated, onError }: { onCreated: () => void; onError: (e: unknown) => void }) {
  const [host, setHost] = useState("")
  const [path, setPath] = useState("/jobs/:jobId")
  return (
    <form
      className="space-y-2 rounded-lg border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        const h = host.trim().toLowerCase()
        const now = new Date().toISOString()
        const config: SiteConfig = { id: "site-" + crypto.randomUUID().slice(0, 12), name: h, hosts: [{ host: h, subdomains: false }], patterns: [{ id: "pat-" + crypto.randomUUID().slice(0, 8), path, query: [], fields: {} }], enabled: true, version: 0, updatedAt: now }
        void rpc({ type: "configs.save", config, expectedVersion: null }).then(() => { setHost(""); onCreated() }, onError)
      }}
    >
      <p className="text-sm font-medium">Add a site by address</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Host"><Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="jobs.example.com" required /></Field>
        <Field label="Job page path" hint="Use :name for the part that changes."><Input value={path} onChange={(e) => setPath(e.target.value)} required /></Field>
      </div>
      <Button type="submit" disabled={!host.trim()}>Add site</Button>
    </form>
  )
}

function Access({ id }: { id: string }) {
  const [lists] = useAsync(() => rpc<ConfigList>({ type: "configs.list" }), [id])
  const config = lists && [...lists.configs, ...lists.bundled].find((c) => c.id === id)
  const [result, setResult] = useState<"granted" | "denied" | null>(null)
  if (!lists) return <main className="p-6 text-sm">Loading…</main>
  if (!config) return <main className="p-6 text-sm">That site no longer exists.</main>
  const origins = config.hosts.flatMap(originPatterns)
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-lg font-semibold">Enable Pypr on {config.name}</h1>
      <p className="text-sm">Pypr will be allowed to run on these addresses so the icon can appear on job pages without you clicking the toolbar:</p>
      <ul className="space-y-1">{origins.map((o) => <li key={o}><code className="rounded-sm bg-muted px-1 text-xs">{o}</code></li>)}</ul>
      <p className="text-xs text-muted-foreground">The icon only appears on pages matching your saved job-page pattern. Other pages on the same site are untouched. You can remove access any time in the extension&apos;s settings.</p>
      {result === "granted" ? (
        <Notice tone="good">Done. Reload the job page to see the icon. You can close this window.</Notice>
      ) : (
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void chrome.permissions.request({ origins }).then((ok) => { setResult(ok ? "granted" : "denied"); if (ok) setTimeout(() => window.close(), 1500) })}>Allow access</Button>
          <Button onClick={() => window.close()}>Not now</Button>
        </div>
      )}
      {result === "denied" && <Notice tone="warn">Access wasn&apos;t granted. The toolbar icon still works on any page.</Notice>}
    </main>
  )
}
