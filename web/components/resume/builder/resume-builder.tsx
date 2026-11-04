"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Braces, CircleCheck, CloudAlert, FileQuestion, FileText, LoaderCircle } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api/client"
import { errorMessage } from "@/lib/api/client"
import { downloadPdf } from "@/lib/api/pdf"
import { useResume, useUpdateResume, type Resume } from "@/lib/api/resumes"
import { printResume } from "@/lib/resume/print"
import type { ResumeData } from "@/lib/resume/types"
import { cn } from "@/lib/utils"
import { BuilderHeader, type BuilderMode, type BuilderView } from "./builder-header"
import { CheckPanel, ParserView } from "./check-panel"
import { DesignPanel } from "./design-panel"
import { defaultFileName, DownloadHistorySheet, type SheetTab } from "./download-history-sheet"
import { PreviewCanvas } from "./preview-canvas"
import { SharePanel } from "./share-panel"
import { WritePanel } from "./write-panel"

const AUTOSAVE_DELAY_MS = 800

export function ResumeBuilder({ id }: { id: string }) {
  const resume = useResume(id)

  if (resume.isPending) return <ResumeBuilderSkeleton />

  if (resume.isError) {
    const missing = resume.error instanceof ApiError && resume.error.status === 404
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon={FileQuestion}
          title={missing ? "Resume not found" : "Couldn't load this resume"}
          description={missing ? "It may have been deleted." : "Check your connection and try again."}
          action={
            <Button variant="outline" asChild>
              <Link href="/resumes">Back to resumes</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return <Editor key={resume.data.id} resume={resume.data} />
}

export function ResumeBuilderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading resume">
      <div className="h-14 shrink-0 border-b" />
      <div className="flex min-h-0 flex-1">
        <div className="w-full space-y-3 border-r p-3 lg:w-[380px] xl:w-[420px]">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
        <div className="hidden flex-1 bg-canvas lg:block" />
      </div>
    </div>
  )
}

type SaveState = "saved" | "dirty" | "saving" | "error"

function Editor({ resume }: { resume: Resume }) {
  const [title, setTitle] = useState(resume.title)
  const [data, setData] = useState<ResumeData>(resume.data)
  const [mode, setMode] = useState<BuilderMode>("write")
  const [view, setView] = useState<BuilderView>("panel")
  const [zoom, setZoom] = useState<number | null>(null)
  const [pages, setPages] = useState<number>()
  const [sheet, setSheet] = useState<{ open: boolean; tab: SheetTab }>({ open: false, tab: "download" })
  const [parserView, setParserView] = useState(false)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify({ title: resume.title, data: resume.data }))
  const deleted = useRef(false)
  // Bumped when content is replaced wholesale, so uncontrolled rich-text editors reload.
  const [revision, setRevision] = useState(0)
  const { mutate, mutateAsync, isPending, isError } = useUpdateResume(resume.id)
  const [pdfBusy, setPdfBusy] = useState(false)

  const payload = useMemo(() => ({ title: title.trim(), data }), [title, data])
  const payloadJson = useMemo(() => JSON.stringify(payload), [payload])
  const dirty = payloadJson !== savedJson
  const titleValid = payload.title.length > 0 && payload.title.length <= 200

  useEffect(() => {
    if (!dirty || !titleValid) return
    const t = setTimeout(() => mutate(payload, { onSuccess: () => setSavedJson(payloadJson) }), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [dirty, titleValid, payload, payloadJson, mutate])

  // Flush pending edits when leaving the page within the debounce window (not after a delete).
  const latest = useRef({ dirty, titleValid, payload })
  useEffect(() => {
    latest.current = { dirty, titleValid, payload }
  })
  useEffect(
    () => () => {
      const l = latest.current
      if (l.dirty && l.titleValid && !deleted.current) mutate(l.payload)
    },
    [mutate],
  )

  useEffect(() => {
    if (!dirty && !isPending) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, isPending])

  const state: SaveState = isPending ? "saving" : isError ? "error" : dirty ? "dirty" : "saved"
  const set = <K extends keyof ResumeData>(key: K) => (value: ResumeData[K]) => setData((d) => ({ ...d, [key]: value }))

  const print = (fileName = defaultFileName(data, title)) => printResume({ fileName, settings: data.settings })
  // The PDF is rendered on the server from the saved resume, so pending edits are saved first.
  const downloadResumePdf = async (fileName = defaultFileName(data, title)) => {
    if (dirty && !titleValid) {
      toast.error("Add a title so your latest changes can be saved first.")
      return
    }
    setPdfBusy(true)
    try {
      if (dirty) {
        await mutateAsync(payload)
        setSavedJson(payloadJson)
      }
      await downloadPdf(`/resumes/${encodeURIComponent(resume.id)}/pdf`, fileName)
    } catch (err) {
      toast.error(errorMessage(err) ?? "Couldn't create the PDF. Try again.")
    } finally {
      setPdfBusy(false)
    }
  }
  const replace = (next: ResumeData) => {
    setData(next)
    setRevision((r) => r + 1)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-print="reset">
      <BuilderHeader
        id={resume.id}
        title={title}
        onTitleChange={setTitle}
        titleValid={titleValid}
        status={
          <SaveStatus
            state={state}
            titleValid={titleValid}
            onRetry={() => mutate(payload, { onSuccess: () => setSavedJson(payloadJson) })}
          />
        }
        mode={mode}
        onModeChange={(next) => {
          setMode(next)
          setView("panel")
        }}
        view={view}
        onViewChange={setView}
        data={data}
        onReplace={(next, keepSettings) => replace(keepSettings ? { ...next, settings: data.settings } : next)}
        onPrint={() => print()}
        onDownloadPdf={() => void downloadResumePdf()}
        pdfBusy={pdfBusy}
        onOpenSheet={(tab) => setSheet({ open: true, tab })}
        onDeleted={() => {
          deleted.current = true
        }}
      />

      <div className="flex min-h-0 flex-1" data-print="reset">
        <aside
          aria-label={{ write: "Content", design: "Design", check: "Check", share: "Share" }[mode]}
          className={cn(
            "w-full shrink-0 overflow-y-auto border-r bg-background lg:block lg:w-[380px] xl:w-[420px]",
            view === "panel" ? "block" : "hidden",
          )}
          data-print="hide"
        >
          {mode === "design" ? (
            <DesignPanel data={data} onChange={set("settings")} />
          ) : mode === "check" ? (
            <CheckPanel data={data} pages={pages} />
          ) : mode === "share" ? (
            <SharePanel resumeId={resume.id} suggestedSlug={data.personalInfo.fullName || title} />
          ) : (
            <WritePanel key={revision} data={data} onChange={setData} />
          )}
        </aside>

        <PreviewCanvas
          data={data}
          zoom={zoom}
          onZoom={setZoom}
          onCompact={() => set("settings")({ ...data.settings, density: "compact" })}
          onPages={setPages}
          className={cn("lg:flex", view === "preview" ? "flex" : "hidden")}
          header={
            mode === "check" && (
              <Segmented
                label="Preview"
                value={parserView ? "parser" : "page"}
                options={[
                  { id: "page", name: "What a person sees", icon: <FileText /> },
                  { id: "parser", name: "What a parser reads", icon: <Braces /> },
                ]}
                onChange={(v) => setParserView(v === "parser")}
                className="border bg-background/60"
              />
            )
          }
        >
          {mode === "check" && parserView ? <ParserView data={data} /> : null}
        </PreviewCanvas>

        <DownloadHistorySheet
          resumeId={resume.id}
          open={sheet.open}
          onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
          tab={sheet.tab}
          onTabChange={(tab) => setSheet((s) => ({ ...s, tab }))}
          title={title}
          data={data}
          canRestore={state === "saved"}
          onDownloadPdf={downloadResumePdf}
          onImport={replace}
          onRestored={(r) => {
            setTitle(r.title)
            replace(r.data)
            setSavedJson(JSON.stringify({ title: r.title.trim(), data: r.data }))
          }}
        />
      </div>
    </div>
  )
}

function SaveStatus({ state, titleValid, onRetry }: { state: SaveState; titleValid: boolean; onRetry: () => void }) {
  if (!titleValid) return <span className="text-xs text-destructive">Add a title to save</span>
  if (state === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive" role="status">
        <CloudAlert className="size-3.5" /> Couldn&apos;t save
        <Button variant="link" size="xs" className="h-auto p-0" onClick={onRetry}>
          Retry
        </Button>
      </span>
    )
  }
  const label = { saving: "Saving…", dirty: "Unsaved changes", saved: "Saved" }[state]
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
      {state === "saving" ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : state === "saved" ? (
        <CircleCheck className="size-3.5 text-success" />
      ) : null}
      {label}
    </span>
  )
}
