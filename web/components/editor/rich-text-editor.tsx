"use client"

import dynamic from "next/dynamic"

import { Skeleton } from "@/components/ui/skeleton"

export type { RichTextEditorProps } from "./rich-text-editor-client"
export { richTextExtensions, type RichTextValue } from "./rich-text-extensions"

/** Uncontrolled after mount: `value` seeds the editor once. Change `key` to reset content. */
export const RichTextEditor = dynamic(() => import("./rich-text-editor-client"), {
  ssr: false,
  loading: () => <Skeleton className="h-[8.5rem] w-full rounded-lg" />,
})
