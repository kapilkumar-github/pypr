import type { Ref } from "react"

import type { ResumeData } from "@/lib/resume/types"
import { pageStyle, ResumeTemplate } from "./templates"

// 96 DPI page sizes.
export const PAPER = {
  a4: { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
} as const

/**
 * The resume on paper. `pages` grows the sheet to whole pages and marks where each page ends
 * (screen only); `paperRef` lets the builder measure the content height.
 */
export function ResumeDocument({
  data,
  scale = 1,
  pages = 1,
  paperRef,
}: {
  data: ResumeData
  scale?: number
  pages?: number
  paperRef?: Ref<HTMLDivElement>
}) {
  const paper = PAPER[data.settings.paperSize] ?? PAPER.a4
  const height = paper.height * pages
  return (
    <div className="resume-scale" style={{ width: paper.width * scale, height: height * scale }}>
      <div
        ref={paperRef}
        id="resume-print-area"
        className="resume-paper relative origin-top-left bg-white p-[calc(var(--margin,1)*3rem)] text-slate-800 shadow-xl ring-1 ring-slate-200"
        style={{ ...pageStyle(data), width: paper.width, minHeight: height, transform: `scale(${scale})` }}
      >
        {/* Plain wrapper: the builder measures it to count pages. */}
        <div>
          <ResumeTemplate data={data} />
        </div>
        {Array.from({ length: pages - 1 }, (_, i) => (
          <div
            key={i}
            aria-hidden
            data-print="hide"
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-slate-300"
            style={{ top: paper.height * (i + 1) }}
          >
            <span className="absolute right-2 -translate-y-1/2 rounded bg-slate-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500">
              Page {i + 2}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
