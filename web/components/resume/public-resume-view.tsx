"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Download, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { PAPER, ResumeDocument } from "@/components/resume/document/resume-document"
import { pageCount, useContentHeight } from "@/components/resume/document/use-page-count"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api/client"
import { downloadPdf } from "@/lib/api/pdf"
import type { ResumeData } from "@/lib/resume/types"

/** Read-only resume page for visitors: the paper scaled to the screen, plus Download PDF when allowed. */
export function PublicResumeView({
  slug,
  title,
  data,
  allowDownload,
}: {
  slug: string
  title: string
  data: ResumeData
  allowDownload: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const paper = PAPER[data.settings.paperSize] ?? PAPER.a4
  const name = data.personalInfo.fullName.trim() || title
  const { paperRef, height } = useContentHeight(scale > 0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const width = entry!.contentRect.width
      if (width) setScale(Math.min(1, width / paper.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [paper.width])

  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      await downloadPdf(`/public/resumes/${encodeURIComponent(slug)}/pdf`, `${name.replace(/\s+/g, "-")}-Resume`)
    } catch (err) {
      toast.error(errorMessage(err) ?? "Couldn't create the PDF. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-svh bg-canvas" data-print="reset">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur" data-print="hide">
        <div className="mx-auto flex h-14 max-w-[900px] items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            {data.personalInfo.jobTitle && <p className="truncate text-xs text-muted-foreground">{data.personalInfo.jobTitle}</p>}
          </div>
          {allowDownload && (
            <Button size="sm" onClick={download} disabled={busy} aria-busy={busy}>
              {busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
              {busy ? "Creating PDF…" : "Download PDF"}
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-[900px] px-3 py-6 sm:px-6" data-print="reset">
        <div ref={ref} data-print="reset">
          <div className="mx-auto w-fit" data-print="reset">
            {scale > 0 && <ResumeDocument data={data} scale={scale} pages={pageCount(height, paper.height)} paperRef={paperRef} />}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground" data-print="hide">
          Made with{" "}
          <Link href="/" className="font-semibold text-foreground hover:underline">
            pypr
          </Link>
        </p>
      </main>
    </div>
  )
}
