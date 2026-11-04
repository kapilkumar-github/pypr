"use client"

import { useEffect, useRef, useState } from "react"
import { CircleCheck, Columns2, Minus, Plus } from "lucide-react"

import { PAPER, ResumeDocument } from "@/components/resume/document/resume-document"
import { pageCount, useContentHeight } from "@/components/resume/document/use-page-count"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ResumeData } from "@/lib/resume/types"
import { cn } from "@/lib/utils"

export const ZOOM = { min: 0.4, max: 1.5, step: 0.1 }

/** Rough height of one body line on the page, used to say how far the resume spills over. */
const LINE_PX = 19

/**
 * Builder preview: the paper on a dark canvas, a page-fit chip above it and a floating zoom pill.
 * Renders at the zoom the user picked, or fit-to-width when `zoom` is null.
 */
export function PreviewCanvas({
  data,
  zoom,
  onZoom,
  onCompact,
  onPages,
  header,
  children,
  className,
}: {
  data: ResumeData
  zoom: number | null
  onZoom: (zoom: number | null) => void
  /** Offered when the resume runs past one page and spacing isn't compact yet. */
  onCompact: () => void
  /** Reports the page count whenever it changes. */
  onPages?: (pages: number) => void
  /** Extra controls above the page-fit chip (e.g. Check's view switch). */
  header?: React.ReactNode
  /** Replaces the paper (e.g. the parser view); the zoom pill hides. */
  children?: React.ReactNode
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const paper = PAPER[data.settings.paperSize] ?? PAPER.a4
  const [fit, setFit] = useState(0)
  const scale = zoom ?? fit
  const ready = scale > 0

  // Fit-to-width scale from the canvas width (minus its padding).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const width = entry!.contentRect.width
      if (width) setFit(Math.min(1, width / paper.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [paper.width])

  const { paperRef: paperEl, height: contentHeight } = useContentHeight(ready)
  const pages = pageCount(contentHeight, paper.height)
  useEffect(() => onPages?.(pages), [pages, onPages])
  const overflowLines = Math.max(1, Math.round((contentHeight - paper.height) / LINE_PX))
  const zoomBy = (delta: number) =>
    onZoom(Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round((scale + delta) * 10) / 10)))

  return (
    <div className={cn("relative flex min-w-0 flex-1 flex-col bg-canvas", className)} data-print="reset">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-24 sm:px-10" data-print="reset">
        {header && (
          <div className="mx-auto mb-3 w-fit" data-print="hide">
            {header}
          </div>
        )}
        {children}
        <div className={cn("mx-auto mb-3 flex w-fit items-center gap-2 text-xs", children && "hidden")} data-print="hide" aria-live="polite">
          {pages === 1 ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-muted-foreground">
              <CircleCheck className="size-3.5 text-success" /> Fits on one page
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 py-0.5 pr-0.5 pl-2.5 font-medium text-warning">
              <Columns2 className="size-3.5" />
              {pages === 2
                ? `Runs onto page 2 by about ${overflowLines} ${overflowLines === 1 ? "line" : "lines"}`
                : `Runs to ${pages} pages`}
              {data.settings.density !== "compact" && (
                <Button size="xs" variant="secondary" className="h-6 rounded-md" onClick={onCompact}>
                  Use compact spacing
                </Button>
              )}
            </span>
          )}
        </div>

        <div className={cn("mx-auto w-fit", children && "hidden")} data-print="reset">
          {ready && <ResumeDocument data={data} scale={scale} pages={pages} paperRef={paperEl} />}
        </div>
      </div>

      <div
        hidden={!!children}
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur"
        data-print="hide"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => zoomBy(-ZOOM.step)} disabled={scale <= ZOOM.min}>
              <Minus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-14 font-mono text-xs"
              aria-label="Fit page to width"
              aria-pressed={zoom === null}
              onClick={() => onZoom(null)}
            >
              {zoom === null ? "Fit" : `${Math.round(scale * 100)}%`}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit page to width</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomBy(ZOOM.step)} disabled={scale >= ZOOM.max}>
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <span className="border-l px-2.5 font-mono text-xs text-muted-foreground">
          {pages} {pages === 1 ? "page" : "pages"}
        </span>
      </div>
    </div>
  )
}
