"use client"

import { useEffect, useRef } from "react"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { EditorState, type Extension } from "@codemirror/state"
import { tags as t } from "@lezer/highlight"
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view"

function languageFor(file: string): Extension {
  if (file.endsWith(".html")) return html()
  if (file.endsWith(".css")) return css()
  return javascript({ typescript: file.endsWith(".ts") })
}

// VS Code "Dark+" colors. Fixed on purpose: the editor stays dark in both app themes.
const vs = { bg: "#1e1e1e", fg: "#d4d4d4", gutter: "#858585", line: "#2a2d2e", selection: "#264f78", cursor: "#aeafad" }

const theme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "13px", backgroundColor: vs.bg, color: vs.fg },
    ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.6" },
    ".cm-content": { caretColor: vs.cursor },
    ".cm-gutters": { backgroundColor: vs.bg, color: vs.gutter, border: "none" },
    ".cm-activeLine": { backgroundColor: vs.line },
    ".cm-activeLineGutter": { backgroundColor: vs.line, color: "#c6c6c6" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: vs.cursor },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: vs.selection },
    "&.cm-focused .cm-matchingBracket": { backgroundColor: "#0064001a", outline: "1px solid #888888" },
  },
  { dark: true },
)

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "#569cd6" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#c586c0" },
  { tag: [t.definitionKeyword, t.modifier, t.self, t.bool, t.null, t.atom], color: "#569cd6" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "#dcdcaa" },
  { tag: [t.definition(t.variableName), t.variableName, t.propertyName, t.attributeName], color: "#9cdcfe" },
  { tag: [t.typeName, t.className, t.namespace], color: "#4ec9b0" },
  { tag: [t.string, t.special(t.string)], color: "#ce9178" },
  { tag: [t.regexp, t.escape], color: "#d16969" },
  { tag: [t.number, t.integer, t.float], color: "#b5cea8" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6a9955", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "#d4d4d4" },
  { tag: [t.tagName, t.angleBracket], color: "#569cd6" },
  { tag: t.attributeValue, color: "#ce9178" },
  { tag: [t.meta, t.documentMeta, t.processingInstruction], color: "#c586c0" },
  { tag: t.invalid, color: "#f44747" },
])

/** A CodeMirror editor for one file. Re-created when the file (tab) changes; `value` seeds it, `onChange` reports edits. */
export function CodeEditor({ file, value, onChange, onRun }: { file: string; value: string; onChange: (v: string) => void; onRun: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onChange, onRun })
  useEffect(() => {
    callbacks.current = { onChange, onRun }
  })

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(highlight),
          keymap.of([{ key: "Mod-Enter", run: () => (callbacks.current.onRun(), true) }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
          languageFor(file),
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.destroy()
    // `value` only seeds the editor for this file; later edits come from the editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" aria-label={`Editor: ${file}`} />
}
