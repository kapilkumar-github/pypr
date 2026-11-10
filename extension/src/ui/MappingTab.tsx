import { FIELDS, FIELD_LABEL, type Field } from "@/lib/schema"
import { Badge, Button, Field as Row, Input, Notice, Spinner } from "./kit"
import type { Panel } from "./state"
import { UrlEditor } from "./UrlEditor"
import { rpc } from "@/lib/rpc"

function PendingCard({ p }: { p: Panel }) {
  const { pending, pendingView: v } = p
  if (!pending || !v) return null
  const g = v.gen
  return (
    <div className="space-y-2 rounded-lg border-2 border-primary bg-card p-3" role="group" aria-label={`Proposed mapping for ${FIELD_LABEL[pending.field]}`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold">Use this as {FIELD_LABEL[pending.field]}?</p>
        <Badge tone="info">not saved yet</Badge>
      </div>
      <p className="text-xs text-muted-foreground">The outlined element on the page is highlighted. This changes how future jobs on this site are read.</p>
      {pending.note && <p className="text-xs text-muted-foreground">{pending.note}</p>}
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Value it gives</p>
        <pre className="pp-scroll max-h-28 overflow-auto rounded-md bg-muted p-2 font-sans text-xs break-words whitespace-pre-wrap" aria-live="polite">{v.value ?? <span className="text-destructive">{v.failure?.detail}</span>}</pre>
      </div>
      {g && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Selector</p>
          <code className="block rounded-md bg-muted p-1.5 text-xs break-all">{g.primary}</code>
          {g.fragile && <p className="mt-1 text-xs text-warning">This selector depends on the element&apos;s position, so it may break when the page changes. A parent or the picker may give a steadier one.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button small onClick={p.moveUp} aria-label="Select the parent container">Parent</Button>
        <Button small onClick={p.moveDown} disabled={pending.below.length === 0} aria-label="Select the child again">Child</Button>
        <Button small onClick={() => p.startPick(pending.field)}>Pick another</Button>
      </div>
      <div className="flex gap-1.5">
        <Button variant="primary" small disabled={!g || !v.value} onClick={p.confirmPending}>Use this</Button>
        <Button small onClick={p.cancelPending}>Cancel</Button>
      </div>
    </div>
  )
}

function FieldRow({ p, field }: { p: Panel; field: Field }) {
  const m = p.pattern?.fields[field]
  const val = p.status?.values[field]
  const fail = p.status?.failures[field]
  return (
    <li className="space-y-1 rounded-md border border-border bg-card p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{FIELD_LABEL[field]}</span>
        <span className="flex items-center gap-1">
          {m ? (fail ? <Badge tone="bad" title={fail.detail}>fails</Badge> : val?.origin === "mapping" ? <Badge tone="good">works</Badge> : <Badge>mapped</Badge>) : <Badge>not mapped</Badge>}
        </span>
      </div>
      {m && <code className="block truncate text-xs text-muted-foreground" title={m.selector}>{m.selector}{m.mode === "attr" ? ` @${m.attr}` : ""}</code>}
      {m && (val?.origin === "mapping" ? <p className="line-clamp-2 text-xs break-words">{val.value}</p> : fail && <p className="text-xs text-destructive">{fail.detail}</p>)}
      <div className="flex gap-1.5">
        <Button small onClick={() => p.startPick(field)}>{m ? "Remap" : "Pick"}</Button>
        {m && <Button small variant="danger" onClick={() => p.clearField(field)}>Clear</Button>}
      </div>
    </li>
  )
}

export function MappingTab({ p }: { p: Panel }) {
  const { cfg, pattern } = p
  const isNew = !p.saved
  const canSave = !!cfg && !cfg.bundled && p.unsaved && (!isNew || p.urlReviewed) && p.busy !== "mapping"

  return (
    <div className="space-y-3 p-3">
      {p.notices.map((n) => <Notice key={n.id} tone={n.tone} onClose={() => p.dismiss(n.id)}>{n.text}</Notice>)}
      {p.picking && (
        <Notice tone="info">
          <p><strong>Picking {FIELD_LABEL[p.picking]}.</strong> Click an element on the page. Nothing underneath is activated. <kbd>↑</kbd> selects the parent, <kbd>Esc</kbd> cancels.</p>
          <Button small className="mt-1.5" onClick={p.stopPicker}>Cancel picking</Button>
        </Notice>
      )}
      <PendingCard p={p} />

      {!cfg || !pattern ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <p>
            {p.info?.kind === "conflict" ? "Choose which saved layout to use in the Job tab." : "This page isn't linked to a saved site yet."}
          </p>
          <p className="text-xs text-muted-foreground">Right-click any text on the page and choose <em>Pypr → Use as</em>, or set the site up here first. You review the URL pattern before anything is saved.</p>
          <Button variant="primary" onClick={p.startSite}>Set up this site</Button>
        </div>
      ) : (
        <>
          {cfg.bundled && <Notice>This is a built-in site. It recognizes the page but knows nothing about its layout. Your first mapping creates your own copy.</Notice>}
          {p.unsaved && <Notice tone="warn">You have unsaved mapping changes. They apply to this page now, not to future jobs, until you save.</Notice>}

          <section className="space-y-2">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Site</h3>
            <Row label="Name"><Input value={cfg.name} maxLength={80} aria-label="Site name" onChange={(e) => p.patchConfig({ name: e.target.value || cfg.name })} disabled={!!cfg.bundled} /></Row>
            <div className="space-y-1 text-xs">
              {cfg.hosts.map((h, i) => (
                <label key={h.host} className="flex items-center gap-2">
                  <code className="rounded-sm bg-muted px-1">{h.host}</code>
                  <input type="checkbox" className="pp-focus" checked={h.subdomains} disabled={!!cfg.bundled} onChange={(e) => p.patchConfig({ hosts: cfg.hosts.map((x, j) => (j === i ? { ...x, subdomains: e.target.checked } : x)) })} />
                  <span className="text-muted-foreground">also match its subdomains</span>
                </label>
              ))}
            </div>
            {cfg.ats && <p className="text-xs text-muted-foreground">Applicant system: {cfg.ats}</p>}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Job page pattern</h3>
            {cfg.patterns.length > 1 && (
              <select aria-label="Page layout" className="pp-focus h-8 w-full rounded-md border border-input bg-card px-2" value={p.patternId ?? ""} onChange={(e) => p.setPatternId(e.target.value)}>
                {cfg.patterns.map((x) => <option key={x.id} value={x.id}>{x.path}</option>)}
              </select>
            )}
            <UrlEditor pattern={pattern} current={p.urlObj} host={cfg.hosts[0]!.host} onChange={p.changeShape} />
            {!cfg.bundled && <Button small onClick={() => p.urlObj && p.addLayout({ path: pattern.path, query: [] })}>Add another layout</Button>}
            {isNew && !cfg.bundled && (
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="pp-focus mt-0.5" checked={p.urlReviewed} onChange={(e) => p.setUrlReviewed(e.target.checked)} />
                <span>I checked which parts of the URL are fixed and which vary. Other pages on this site won&apos;t match.</span>
              </label>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Fields</h3>
            <ul className="space-y-2">{FIELDS.map((f) => <FieldRow key={f} p={p} field={f} />)}</ul>
          </section>

          <div className="sticky bottom-0 -mx-3 space-y-2 border-t border-border bg-background px-3 py-3">
            <Button variant="primary" className="w-full" disabled={!canSave} onClick={() => void p.saveMapping()}>
              {p.busy === "mapping" ? <><Spinner /> Saving…</> : "Save mapping"}
            </Button>
            {isNew && !p.urlReviewed && p.unsaved && <p className="text-xs text-muted-foreground">Confirm the URL pattern above to save.</p>}
            <div className="flex flex-wrap gap-2">
              <Button small onClick={p.undo} disabled={p.trail.length === 0}>Undo</Button>
              <Button small onClick={p.discardMapping} disabled={!p.unsaved}>Cancel changes</Button>
              {p.saved && <Button small variant="danger" onClick={() => { if (confirm("Delete this site and all its mappings?")) void p.deleteSite() }}>Delete site</Button>}
            </div>
            {p.saved && <AccessControl p={p} />}
          </div>
        </>
      )}
    </div>
  )
}

function AccessControl({ p }: { p: Panel }) {
  const granted = p.info?.hasAccess
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs">
      <span>{granted ? "The launcher shows automatically on matching job pages." : "Show the launcher automatically on this site's job pages."}</span>
      {!granted && p.saved && <Button small variant="primary" onClick={() => void rpc({ type: "access.open", configId: p.saved!.id }).catch((e) => p.note("bad", (e as Error).message))}>Enable on this site</Button>}
    </div>
  )
}

