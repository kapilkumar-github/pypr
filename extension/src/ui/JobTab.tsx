import type { ReactNode } from "react"
import { missing } from "@/lib/extract"
import { ARRANGEMENTS, FIELD_LABEL, SOURCES, type Field, type JobForm } from "@/lib/schema"
import { Badge, Button, Field as Row, Input, Notice, Select, Spinner, Textarea } from "./kit"
import type { Panel } from "./state"

const ORIGIN: Record<string, { text: string; tone: "good" | "info" | "warn" }> = {
  mapping: { text: "your mapping", tone: "good" },
  structured: { text: "page data", tone: "info" },
  generic: { text: "guessed from page", tone: "warn" },
}

function Source({ p, field, form }: { p: Panel; field: Field; form: keyof JobForm }) {
  const r = p.extraction?.values[field]
  const fail = p.extraction?.failures[field]
  if (p.edited.has(form)) return <Badge>edited</Badge>
  if (fail && !r) return <Badge tone="bad" title={fail.detail}>mapping failed</Badge>
  return r ? <Badge tone={ORIGIN[r.origin]?.tone ?? "neutral"}>{ORIGIN[r.origin]?.text}</Badge> : null
}

function Mapped({ p, field, form, label, children, error }: { p: Panel; field: Field; form: keyof JobForm; label?: string; children: ReactNode; error?: string }) {
  const fail = p.extraction?.failures[field]
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label ?? FIELD_LABEL[field]}</span>
        <span className="flex items-center gap-1.5">
          <Source p={p} field={field} form={form} />
          <button type="button" onClick={() => p.startPick(field)} className="pp-focus cursor-pointer rounded-sm text-xs text-accent-foreground underline" aria-label={`Pick ${FIELD_LABEL[field]} from the page`} title="Teach Pypr where this is on the page">Pick on page</button>
        </span>
      </div>
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {fail && (
        <p role="alert" className="text-xs text-destructive">
          The saved selector failed: {fail.detail} <button type="button" className="pp-focus cursor-pointer underline" onClick={() => p.startPick(field)}>Remap</button>
        </p>
      )}
    </div>
  )
}

export function JobTab({ p }: { p: Panel }) {
  const { form, errors, phase } = p
  const m = missing(form)
  const set = (k: keyof JobForm) => (e: { target: { value: string } }) => p.editField(k, e.target.value)

  if (phase.kind === "saved" || phase.kind === "confirm-applied" || phase.kind === "marking") return <SavedCard p={p} />

  return (
    <div className="space-y-3 p-3">
      <Banner p={p} />
      {!p.captured ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-3">
          <p className="text-sm">Read the details from this page, check them, then save the job to your tracker. Nothing is saved until you confirm.</p>
          <Button variant="primary" className="w-full" onClick={() => void p.capture("first")} disabled={p.busy === "capture"}>
            {p.busy === "capture" ? <><Spinner /> Reading the page…</> : "Add this job"}
          </Button>
          {p.info?.kind === "none" && (
            <p className="text-xs text-muted-foreground">
              This site isn&apos;t set up yet. Pypr will use the page&apos;s job data if it has any. To teach it where things are, <button type="button" className="pp-focus cursor-pointer underline" onClick={p.startSite}>set up this site</button>.
            </p>
          )}
        </div>
      ) : (
        <>
          {(m.required.length > 0 || m.optional.length > 0) && (
            <Notice tone={m.required.length ? "warn" : "info"}>
              {m.required.length > 0 && <p><strong>Needed to save:</strong> {m.required.join(", ")}.</p>}
              {m.optional.length > 0 && <p><strong>Not found:</strong> {m.optional.join(", ")}. Fill them in, or use <em>Pick on page</em>.</p>}
            </Notice>
          )}
          <p className="text-xs text-muted-foreground">Editing a value changes this job only. <em>Pick on page</em> changes how future jobs are read.</p>

          <Mapped p={p} field="title" form="title" error={errors.title}>
            <Input value={form.title} onChange={set("title")} maxLength={300} aria-label="Job title" aria-invalid={!!errors.title} />
          </Mapped>
          <Mapped p={p} field="company" form="company" error={errors.company}>
            <Input value={form.company} onChange={set("company")} maxLength={200} aria-label="Company" aria-invalid={!!errors.company} />
          </Mapped>
          <Mapped p={p} field="location" form="location">
            <Input value={form.location} onChange={set("location")} maxLength={300} aria-label="Location" />
          </Mapped>
          <div className="grid grid-cols-2 gap-2">
            <Mapped p={p} field="arrangement" form="workArrangement" label="Arrangement">
              <Select value={form.workArrangement} onChange={set("workArrangement")} aria-label="Work arrangement">
                {ARRANGEMENTS.map((a) => <option key={a} value={a}>{a === "unknown" ? "Not stated" : a[0]!.toUpperCase() + a.slice(1)}</option>)}
              </Select>
            </Mapped>
            <Mapped p={p} field="employmentType" form="employmentType" label="Type">
              <Input value={form.employmentType} onChange={set("employmentType")} maxLength={100} placeholder="Full-time" aria-label="Employment type" />
            </Mapped>
          </div>
          <Mapped p={p} field="salary" form="salaryText">
            <Input value={form.salaryText} onChange={set("salaryText")} maxLength={300} placeholder="As listed" aria-label="Salary" />
            {(form.salaryMin || form.salaryMax || form.salaryCurrency) && (
              <p className="mt-1 text-xs text-muted-foreground">Will be saved as {form.salaryCurrency || "(currency not stated)"} {form.salaryMin}{form.salaryMax && form.salaryMax !== form.salaryMin ? `–${form.salaryMax}` : ""}{form.salaryPeriod ? ` per ${form.salaryPeriod}` : ""}.</p>
            )}
          </Mapped>
          <Mapped p={p} field="description" form="description">
            <Textarea value={form.description} onChange={set("description")} rows={6} aria-label="Description" />
          </Mapped>
          <Mapped p={p} field="applicationUrl" form="applicationUrl">
            <Input value={form.applicationUrl} onChange={set("applicationUrl")} maxLength={2000} placeholder="https://…" aria-label="Application link" inputMode="url" />
          </Mapped>
          <Row label="Job page (where you found it)">
            <Input value={form.discoveryUrl} onChange={set("discoveryUrl")} maxLength={2000} aria-label="Job page" inputMode="url" />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Source">
              <Select value={form.source} onChange={set("source")} aria-label="Source">
                <option value="">Not stated</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Row>
            <Row label="Job ID">
              <Input value={form.externalId} onChange={set("externalId")} maxLength={200} aria-label="Job ID" />
            </Row>
          </div>

          {phase.kind === "duplicates" && <Duplicates p={p} />}

          <div className="sticky bottom-0 -mx-3 space-y-2 border-t border-border bg-background px-3 py-3">
            <Button variant="primary" className="w-full" disabled={phase.kind === "checking" || phase.kind === "saving"} onClick={() => void p.save(false)}>
              {phase.kind === "checking" ? <><Spinner /> Checking…</> : phase.kind === "saving" ? <><Spinner /> Saving…</> : "Save to Pypr"}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button small onClick={() => void p.capture("rescan")} disabled={p.busy === "capture"} title="Read the page again. Values you typed are kept.">Re-read page</Button>
              <Button small variant="ghost" onClick={() => void p.capture("replace")} disabled={p.busy === "capture"} title="Read the page again and overwrite everything, including your edits.">Replace all</Button>
              <Button small variant="ghost" onClick={p.restart}>Clear</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Banner({ p }: { p: Panel }) {
  return (
    <div className="space-y-2">
      {p.notices.map((n) => <Notice key={n.id} tone={n.tone} onClose={() => p.dismiss(n.id)}>{n.text}</Notice>)}
      {p.info?.kind === "conflict" && (
        <Notice tone="warn">
          <p className="mb-1.5">More than one saved layout fits this page equally well. Which one should be used?</p>
          <div className="flex flex-wrap gap-1.5">
            {p.info.choices?.map((c) => <Button key={c.configId + c.patternId} small onClick={() => p.choose(c)}>{c.name} {c.path}</Button>)}
          </div>
        </Notice>
      )}
      {p.session && !p.session.user && (
        <Notice tone="info">
          <p className="mb-1.5">Connect your Pypr account to save jobs. You sign in on the Pypr website; the extension never sees your password.</p>
          <Button small variant="primary" onClick={() => void p.connect()}>Connect Pypr</Button>
        </Notice>
      )}
      {p.unsaved && (
        <Notice tone="warn">
          Your mapping changes aren't saved, so future jobs won't use them yet. <button type="button" className="pp-focus cursor-pointer underline" onClick={() => p.setTab("mapping")}>Review and save</button>
        </Notice>
      )}
      {p.session?.stale && <Notice tone="warn">Pypr couldn&apos;t be reached, so your account wasn&apos;t re-checked.</Notice>}
    </div>
  )
}

function Duplicates({ p }: { p: Panel }) {
  if (p.phase.kind !== "duplicates") return null
  const strong = p.phase.items.some((d) => d.reason !== "company_title")
  const web = p.session?.webOrigin ?? ""
  return (
    <Notice tone="warn">
      <p className="mb-1.5 font-semibold">{strong ? "You may have saved this job already." : "A job with the same company and title exists."}</p>
      <ul className="mb-2 space-y-1">
        {p.phase.items.map((d) => (
          <li key={d.id}>
            <a className="pp-focus underline" href={`${web}/job-tracker/${d.id}`} target="_blank" rel="noopener noreferrer">{d.title} at {d.company}</a>{" "}
            <Badge tone={d.reason === "company_title" ? "neutral" : "warn"}>{d.reason === "url" ? "same link" : d.reason === "external_id" ? "same job ID" : "same company and title (weak match)"}</Badge> <Badge>{d.status}</Badge>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button small variant="primary" onClick={() => void p.save(true)}>Save as a new job</Button>
        <Button small onClick={() => p.setPhase({ kind: "idle" })}>Cancel</Button>
      </div>
    </Notice>
  )
}

function SavedCard({ p }: { p: Panel }) {
  const { phase } = p
  if (phase.kind !== "saved" && phase.kind !== "confirm-applied" && phase.kind !== "marking") return null
  const web = p.session?.webOrigin ?? ""
  const applied = phase.kind === "saved" && phase.applied
  const appUrl = p.form.applicationUrl
  const safeApp = /^https?:\/\//i.test(appUrl)
  return (
    <div className="space-y-3 p-3">
      <Banner p={p} />
      <div className="space-y-2 rounded-lg border border-success/40 bg-success/10 p-3">
        <p className="font-semibold">Saved to your Pypr tracker.</p>
        <p className="text-xs text-muted-foreground">{p.form.title} · {p.form.company}</p>
        <a className="pp-focus inline-block text-sm underline" href={`${web}/job-tracker/${phase.id}`} target="_blank" rel="noopener noreferrer">Open in Pypr</a>
      </div>
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold text-muted-foreground">Applying</p>
        {safeApp ? (
          <p className="text-xs"><a className="pp-focus underline" href={appUrl} target="_blank" rel="noopener noreferrer">Open the application page</a>. Opening it does not change this job&apos;s status.</p>
        ) : <p className="text-xs text-muted-foreground">No application link was found.</p>}
        {applied ? (
          <p className="text-xs"><Badge tone="good">Applied</Badge> Recorded in your tracker.</p>
        ) : phase.kind === "confirm-applied" || phase.kind === "marking" ? (
          <div className="space-y-2">
            <p className="text-xs">Only confirm after you have submitted the application on the employer&apos;s site. Pypr doesn&apos;t submit it or upload your resume.</p>
            <div className="flex gap-2">
              <Button small variant="primary" disabled={phase.kind === "marking"} onClick={() => void p.markApplied(phase.id)}>{phase.kind === "marking" ? "Saving…" : "Yes, I applied"}</Button>
              <Button small onClick={() => p.setPhase({ kind: "saved", id: phase.id, applied: false })}>Not yet</Button>
            </div>
          </div>
        ) : (
          <Button small onClick={() => p.setPhase({ kind: "confirm-applied", id: phase.id })}>I submitted my application…</Button>
        )}
      </div>
      <Button small variant="ghost" onClick={p.restart}>Capture another job</Button>
    </div>
  )
}
