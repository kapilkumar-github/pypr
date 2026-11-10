import { useState } from "react"
import type { PagePattern, QueryRule } from "@/lib/schema"
import { matchPattern, parts, toggleSegment, validPath } from "@/lib/urlpattern"
import { Badge, Field, Input } from "./kit"

/** Shows which parts of the job URL are fixed and which vary, and lets the user change that. */
export function UrlEditor({ pattern, current, host, onChange }: { pattern: Pick<PagePattern, "path" | "query">; current: URL | null; host: string; onChange: (shape: { path: string; query: QueryRule[] }) => void }) {
  const [draftPath, setDraftPath] = useState<string | null>(null)
  const shown = draftPath ?? pattern.path
  const problem = validPath(shown)
  const matches = current ? matchPattern(pattern, current) : null
  const segs = pattern.path.split("/").filter(Boolean)

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-muted p-2 font-mono text-xs break-all" aria-label="URL pattern">
        <span className="text-muted-foreground">{host}</span>
        {parts(pattern).map((p, i) => {
          const isQuery = p.text.startsWith("?")
          const seg = i < segs.length ? i : -1
          return (
            <button
              key={i}
              type="button"
              disabled={isQuery || !current}
              title={p.fixed ? "Fixed: must match exactly. Click to make it vary." : "Varies between jobs. Click to make it fixed."}
              onClick={() => current && seg >= 0 && onChange({ path: toggleSegment(pattern.path, seg, current), query: pattern.query })}
              className={`pp-focus mx-px cursor-pointer rounded-sm px-0.5 ${p.fixed ? "bg-card text-foreground" : "bg-accent text-accent-foreground"}`}
            >
              {p.text}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        <Badge>fixed</Badge> parts must match exactly. <Badge tone="info">varies</Badge> parts can be anything, like a job ID. Click a part to switch it.
      </p>
      <Field label="Path" error={problem ?? undefined}>
        <Input
          value={shown}
          aria-label="Path pattern"
          spellCheck={false}
          onChange={(e) => {
            setDraftPath(e.target.value)
            if (!validPath(e.target.value)) onChange({ path: e.target.value, query: pattern.query })
          }}
          onBlur={() => setDraftPath(null)}
        />
      </Field>
      {pattern.query.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Required query parameters</p>
          {pattern.query.map((q, i) => (
            <div key={q.name} className="flex items-center gap-2 text-xs">
              <code className="rounded-sm bg-muted px-1">{q.name}</code>
              <select
                aria-label={`${q.name} value`}
                className="pp-focus h-7 rounded-md border border-input bg-card px-1"
                value={q.value === undefined ? "any" : "fixed"}
                onChange={(e) => onChange({ path: pattern.path, query: pattern.query.map((x, j) => (j === i ? { name: x.name, value: e.target.value === "fixed" ? current?.searchParams.get(x.name) ?? "" : undefined } : x)) })}
              >
                <option value="any">any value (identifies the job)</option>
                <option value="fixed">always {current?.searchParams.get(q.name) ?? "this value"}</option>
              </select>
              <button type="button" className="pp-focus cursor-pointer text-muted-foreground" aria-label={`Stop requiring ${q.name}`} onClick={() => onChange({ path: pattern.path, query: pattern.query.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
        </div>
      )}
      {current && (
        <p role="status" className={`text-xs ${matches ? "text-success" : "text-destructive"}`}>
          {matches ? `Matches this page${Object.keys(matches).length ? ": " + Object.entries(matches).map(([k, v]) => `${k} = ${v}`).join(", ") : ""}.` : "This pattern doesn't match the page you're on."}
        </p>
      )}
    </div>
  )
}
