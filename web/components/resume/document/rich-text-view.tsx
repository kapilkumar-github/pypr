import type { JSONContent } from "@tiptap/react"

import type { RichText } from "@/lib/resume/types"
import { cn } from "@/lib/utils"

const SAFE_HREF = /^(https?:|mailto:)/i

type Mark = NonNullable<JSONContent["marks"]>[number]

function withMarks(text: React.ReactNode, marks: Mark[] = [], key: React.Key): React.ReactNode {
  return marks.reduce<React.ReactNode>((node, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong key={key}>{node}</strong>
      case "italic":
        return <em key={key}>{node}</em>
      case "underline":
        return <u key={key}>{node}</u>
      case "link": {
        const href = String(mark.attrs?.href ?? "")
        return SAFE_HREF.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
            {node}
          </a>
        ) : (
          node
        )
      }
      default:
        return node
    }
  }, text)
}

function renderNodes(nodes: JSONContent[] = []): React.ReactNode[] {
  return nodes.map((n, i) => {
    const children = renderNodes(n.content)
    switch (n.type) {
      case "paragraph":
        return <p key={i}>{children}</p>
      case "bulletList":
        return (
          <ul key={i} className="list-disc space-y-0.5 pl-4">
            {children}
          </ul>
        )
      case "orderedList":
        return (
          <ol key={i} className="list-decimal space-y-0.5 pl-4">
            {children}
          </ol>
        )
      case "listItem":
        return <li key={i}>{children}</li>
      case "hardBreak":
        return <br key={i} />
      case "text":
        return withMarks(n.text ?? "", n.marks, i)
      default:
        return null
    }
  })
}

/** Renders stored Tiptap JSON as React elements. Unknown nodes are dropped; only http(s)/mailto links render. */
export function RichTextView({ value, className }: { value: RichText; className?: string }) {
  if (!value) return null
  return <div className={cn("space-y-1 [&_li>p]:inline", className)}>{renderNodes(value.content)}</div>
}
