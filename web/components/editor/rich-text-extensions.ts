import type { JSONContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

export type RichTextValue = JSONContent

/** Shared schema for editing and read-only rendering; content outside it is dropped. */
export const richTextExtensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
  }),
]
