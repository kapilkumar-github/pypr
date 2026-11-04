"use client"

import { useEffect, useRef, useState } from "react"

import type { ResumeData } from "@/lib/resume/types"
import { PAPER } from "./resume-document"
import { pageStyle, ResumeTemplate } from "./templates"

/** Non-interactive preview of a resume's first page, scaled to the container's width. */
export function ResumeThumbnail({ data }: { data: ResumeData }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const paper = PAPER[data.settings.paperSize] ?? PAPER.a4

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} aria-hidden inert className="h-full w-full overflow-hidden rounded-sm bg-white shadow-xs">
      {width > 0 && (
        <div
          className="origin-top-left bg-white p-[calc(var(--margin,1)*3rem)] text-slate-800 select-none"
          style={{ ...pageStyle(data), width: paper.width, minHeight: paper.height, transform: `scale(${width / paper.width})` }}
        >
          <ResumeTemplate data={data} />
        </div>
      )}
    </div>
  )
}
