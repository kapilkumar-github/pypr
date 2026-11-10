import { Fragment } from "react"

import { cn } from "@/lib/utils"

/** Inline code, bold and italics. Everything is rendered as React text, never as HTML. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {p.slice(1, -1)}
          </code>
        ) : p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

/** A small Markdown subset for problem statements: headings, paragraphs, lists, fenced code. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks: React.ReactNode[] = []
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.startsWith("```")) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!)
      i++
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
          {code.join("\n")}
        </pre>,
      )
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <h3 key={key++} className="pt-2 text-sm font-bold">
          <Inline text={line.replace(/^#{1,6}\s+/, "")} />
        </h3>,
      )
      i++
    } else if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""))
      const L = ordered ? "ol" : "ul"
      blocks.push(
        <L key={key++} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
          {items.map((t, n) => (
            <li key={n}>
              <Inline text={t} />
            </li>
          ))}
        </L>,
      )
    } else if (!line.trim()) {
      i++
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i]!.trim() && !lines[i]!.startsWith("```") && !/^#{1,6}\s/.test(lines[i]!) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]!)) para.push(lines[i++]!)
      blocks.push(
        <p key={key++}>
          <Inline text={para.join(" ")} />
        </p>,
      )
    }
  }
  return <div className={cn("space-y-3 text-sm leading-relaxed", className)}>{blocks}</div>
}
