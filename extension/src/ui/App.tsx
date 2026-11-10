import { useCallback, useEffect, useRef, useState } from "react"
import { FIELD_LABEL } from "@/lib/schema"
import { Highlight } from "./Highlight"
import { JobTab } from "./JobTab"
import { MappingTab } from "./MappingTab"
import { bus } from "./bus"
import { Button, PyprMark } from "./kit"
import { usePanel } from "./state"

export function App() {
  const [open, setOpen] = useState(false)
  const p = usePanel(open)
  const [collapsed, setCollapsed] = useState(false)
  const opener = useRef<Element | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)

  const show = useCallback(() => {
    setOpen((was) => {
      if (!was) opener.current = document.activeElement
      return true
    })
    setCollapsed(false)
  }, [])
  const close = useCallback(() => {
    p.stopPicker()
    setOpen(false)
    setTimeout(() => (opener.current instanceof HTMLElement && opener.current.isConnected ? opener.current : fabRef.current)?.focus(), 0)
  }, [p])

  const { onTabMessage } = p
  useEffect(() => bus.subscribe((m) => {
    if (m.type === "panel.open") show()
    else onTabMessage(m)
  }), [show, onTabMessage])

  // Keyboard: move focus into the panel when it opens; Escape closes it (unless the picker is using Escape).
  useEffect(() => {
    if (open && !collapsed) panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
  }, [open, collapsed])

  const showLauncher = !open && !!p.info && p.info.kind !== "none" && p.info.autoLauncher

  return (
    <div className="pp-root" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483646 }}>
      {showLauncher && (
        <button
          ref={fabRef}
          type="button"
          className="pp-fab pp-focus"
          aria-label="Open Pypr job capture"
          title="Save this job to Pypr"
          onClick={show}
          style={{ pointerEvents: "auto", position: "fixed", right: 16, bottom: 24, width: 44, height: 44, borderRadius: 22, border: "none", cursor: "pointer", background: "var(--primary)", color: "var(--primary-foreground)", display: "grid", placeItems: "center" }}
        >
          <PyprMark size={26} />
        </button>
      )}

      {open && collapsed && (
        <aside aria-label="Pypr (collapsed)" className="pp-panel" style={{ pointerEvents: "auto", position: "fixed", top: 0, right: 0, height: "100vh", width: 44, background: "var(--background)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 12 }}>
          <Button small variant="ghost" aria-label="Expand Pypr panel" onClick={() => setCollapsed(false)} data-autofocus>«</Button>
          <span style={{ writingMode: "vertical-rl", color: "var(--muted-foreground)", fontSize: 12, fontWeight: 600 }}>Pypr</span>
          <Button small variant="ghost" aria-label="Close Pypr panel" onClick={close}>×</Button>
        </aside>
      )}

      {open && !collapsed && (
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Pypr job capture"
          className="pp-panel"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !p.picking) { e.stopPropagation(); close() }
          }}
          style={{ pointerEvents: "auto", position: "fixed", top: 0, right: 0, height: "100vh", width: "min(420px, 100vw)", background: "var(--background)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column" }}
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <span className="text-primary"><PyprMark size={22} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base leading-tight font-semibold">Pypr</h2>
              <p className="truncate text-xs text-muted-foreground">
                {p.info?.match ? p.info.match.config.name : p.info?.kind === "conflict" ? "Choose a layout" : "New site"}
                {p.session?.user ? ` · ${p.session.user.email}` : ""}
              </p>
            </div>
            <Button small variant="ghost" aria-label="Collapse panel" title="Collapse" onClick={() => setCollapsed(true)}>»</Button>
            <Button small variant="ghost" aria-label="Close panel" title="Close (Esc)" onClick={close} data-autofocus>×</Button>
          </header>
          <div role="tablist" aria-label="Pypr sections" className="flex border-b border-border px-2">
            {(["job", "mapping"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                id={`pp-tab-${t}`}
                aria-selected={p.tab === t}
                aria-controls={`pp-panel-${t}`}
                type="button"
                onClick={() => p.setTab(t)}
                className={`pp-focus cursor-pointer border-b-2 px-3 py-2 text-sm font-medium ${p.tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
              >
                {t === "job" ? "Job" : <>Site &amp; mapping{p.unsaved && <span aria-label="unsaved changes"> •</span>}</>}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`pp-panel-${p.tab}`} aria-labelledby={`pp-tab-${p.tab}`} className="pp-scroll min-h-0 flex-1 overflow-y-auto">
            {p.tab === "job" ? <JobTab p={p} /> : <MappingTab p={p} />}
          </div>
        </aside>
      )}

      {open && p.pending && <Highlight target={p.pending.el} kind="chosen" label={FIELD_LABEL[p.pending.field]} />}
      {p.picking && p.hover && <Highlight target={p.hover} kind="hover" label={`${p.hover.localName}${p.hover.id ? "#" + p.hover.id : ""}`} />}
    </div>
  )
}
