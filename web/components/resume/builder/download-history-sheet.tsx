"use client"

import { useRef, useState } from "react"
import { Braces, ClipboardCopy, Download, FileCode2, FileText, FileType2, FileUp, History, LoaderCircle, RotateCcw, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { errorMessage } from "@/lib/api/client"
import {
  useDeleteVersion,
  useRestoreVersion,
  useResumeVersions,
  useSaveVersion,
  type Resume,
  type ResumeVersion,
} from "@/lib/api/resumes"
import { normalizeResume } from "@/lib/resume/defaults"
import { resumeToMarkdown, resumeToPlainText, resumeToWordHtml } from "@/lib/resume/plain-text"
import type { ResumeData } from "@/lib/resume/types"
import { cn } from "@/lib/utils"

const MAX_IMPORT_BYTES = 512 * 1024

const FORMATS = [
  { id: "pdf", name: "PDF", ext: ".pdf", icon: FileText, note: "Looks exactly like the page. Use it for applications and email.", badge: "Best for applying" },
  { id: "doc", name: "Word", ext: ".doc", icon: FileType2, note: "For portals or recruiters that ask for Word. Layout is simplified." },
  { id: "md", name: "Markdown", ext: ".md", icon: FileCode2, note: "Plain text with headings. Paste into forms and docs." },
  { id: "txt", name: "Plain text", ext: ".txt", icon: FileText, note: "No formatting at all, for the plainest application forms." },
  { id: "json", name: "JSON backup", ext: ".json", icon: Braces, note: "Complete data. Import it back into pypr any time." },
] as const
type FormatId = (typeof FORMATS)[number]["id"]

export type SheetTab = "download" | "history"

function save(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Reads a backup made by "JSON backup" (or a bare resume object). Returns null when it isn't one. */
function parseBackup(text: string): ResumeData | null {
  try {
    const json: unknown = JSON.parse(text)
    if (!json || typeof json !== "object") return null
    const raw = "data" in json ? (json as { data: unknown }).data : json
    if (!raw || typeof raw !== "object" || !("personalInfo" in raw)) return null
    return normalizeResume(raw)
  } catch {
    return null
  }
}

export function defaultFileName(data: ResumeData, title: string) {
  return [data.personalInfo.fullName.trim() || title.trim(), "Resume"].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-")
}

/** Right-hand sheet with every export format and the version history. */
export function DownloadHistorySheet({
  resumeId,
  tab,
  onTabChange,
  open,
  onOpenChange,
  title,
  data,
  canRestore,
  onDownloadPdf,
  onImport,
  onRestored,
}: {
  resumeId: string
  tab: SheetTab
  onTabChange: (tab: SheetTab) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  data: ResumeData
  /** False while edits are unsaved, so a restore can't race an autosave. */
  canRestore: boolean
  /** Saves pending edits, then downloads the server-rendered PDF. */
  onDownloadPdf: (fileName: string) => Promise<void>
  onImport: (data: ResumeData) => void
  onRestored: (resume: Resume) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md" data-print="hide">
        <SheetHeader className="border-b">
          <SheetTitle>Download &amp; history</SheetTitle>
          <SheetDescription className="sr-only">Download this resume in another format, or restore an earlier version.</SheetDescription>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as SheetTab)} className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="w-full justify-start border-b px-4">
            <TabsTrigger value="download" className="flex-none">
              <Download /> Download
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-none">
              <History /> History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="download" className="min-h-0 overflow-y-auto p-4">
            <DownloadTab title={title} data={data} onDownloadPdf={onDownloadPdf} onImport={onImport} />
          </TabsContent>
          <TabsContent value="history" className="min-h-0 overflow-y-auto p-4">
            {open && tab === "history" && (
              <HistoryTab resumeId={resumeId} canRestore={canRestore} onRestored={onRestored} />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function DownloadTab({
  title,
  data,
  onDownloadPdf,
  onImport,
}: {
  title: string
  data: ResumeData
  /** Saves pending edits, then downloads the server-rendered PDF. */
  onDownloadPdf: (fileName: string) => Promise<void>
  onImport: (data: ResumeData) => void
}) {
  const [format, setFormat] = useState<FormatId>("pdf")
  const [name, setName] = useState(() => defaultFileName(data, title))
  const [pending, setPending] = useState<{ file: string; data: ResumeData } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const f = FORMATS.find((x) => x.id === format)!
  const base = name.trim() || "Resume"
  const [busy, setBusy] = useState(false)

  const download = async () => {
    switch (format) {
      case "pdf":
        setBusy(true)
        try {
          await onDownloadPdf(base)
        } finally {
          setBusy(false)
        }
        return
      case "doc":
        return save(`${base}.doc`, resumeToWordHtml(data), "application/msword")
      case "md":
        return save(`${base}.md`, resumeToMarkdown(data), "text/markdown;charset=utf-8")
      case "txt":
        return save(`${base}.txt`, resumeToPlainText(data), "text/plain;charset=utf-8")
      case "json":
        return save(`${base}.json`, JSON.stringify({ app: "pypr", version: 1, title, data }, null, 2), "application/json")
    }
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) return toast.error("That file is too large to be a resume backup.")
    const parsed = parseBackup(await file.text())
    if (!parsed) return toast.error("That file isn't a pypr resume backup.")
    setPending({ file: file.name, data: parsed })
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Format" className="space-y-2">
        {FORMATS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={format === x.id}
            onClick={() => setFormat(x.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
              format === x.id && "border-primary bg-primary/5 hover:bg-primary/5",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted [&_svg]:size-4">
              <x.icon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {x.name} <span className="font-mono text-xs font-normal text-muted-foreground">{x.ext}</span>
                {"badge" in x && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{x.badge}</span>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{x.note}</span>
            </span>
            <span className={cn("mt-1 size-4 shrink-0 rounded-full border-2", format === x.id ? "border-[5px] border-primary" : "border-muted-foreground/40")} />
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="download-name" className="text-xs font-medium text-muted-foreground">
          File name
        </label>
        <div className="flex items-center gap-2">
          <Input id="download-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="font-mono" />
          <span className="font-mono text-xs text-muted-foreground">{f.ext}</span>
        </div>
        {format === "pdf" && (
          <p className="text-xs text-muted-foreground">Saves your latest changes, then builds the PDF with selectable text. Takes a few seconds.</p>
        )}
      </div>

      <Button className="w-full" onClick={download} disabled={busy}>
        {busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
        {busy ? "Creating PDF…" : `Download ${f.name}`}
      </Button>

      <div className="flex gap-2 border-t pt-4">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(resumeToPlainText(data))
              toast.success("Copied as plain text")
            } catch {
              toast.error("Couldn't copy. Your browser blocked clipboard access.")
            }
          }}
        >
          <ClipboardCopy data-icon="inline-start" /> Copy as text
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => fileInput.current?.click()}>
          <FileUp data-icon="inline-start" /> Import backup
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void importFile(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import “{pending?.file}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces everything in this resume, including design settings. The current version stays in History.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onImport(pending.data)
                setPending(null)
              }}
            >
              Replace content
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

function HistoryTab({ resumeId, canRestore, onRestored }: { resumeId: string; canRestore: boolean; onRestored: (r: Resume) => void }) {
  const versions = useResumeVersions(resumeId)
  const saveVersion = useSaveVersion(resumeId)
  const restore = useRestoreVersion(resumeId)
  const remove = useDeleteVersion(resumeId)
  const [label, setLabel] = useState("")
  const [confirm, setConfirm] = useState<ResumeVersion | null>(null)

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!label.trim()) return
          saveVersion.mutate(label.trim(), {
            onSuccess: () => {
              setLabel("")
              toast.success("Version saved")
            },
            onError: (err) => toast.error(errorMessage(err) ?? "Couldn't save the version."),
          })
        }}
      >
        <Input aria-label="Version name" placeholder="Name this version, e.g. Sent to Acme" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!label.trim() || saveVersion.isPending}>
          <Save data-icon="inline-start" /> Save
        </Button>
      </form>
      {!canRestore && <p className="text-xs text-muted-foreground">Saving your latest edits… Versions save what&apos;s already saved.</p>}

      <ol className="relative space-y-1 border-l pl-4">
        <li className="relative rounded-lg border border-primary/40 bg-primary/5 p-2.5">
          <span className="absolute top-3.5 -left-[21px] size-2.5 rounded-full bg-primary" />
          <p className="text-sm font-semibold">Now</p>
          <p className="text-xs text-muted-foreground">The resume as it is</p>
        </li>
        {versions.isPending &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-12 rounded-lg" />
            </li>
          ))}
        {versions.data?.map((v) => (
          <li key={v.id} className="group relative flex items-center gap-2 rounded-lg p-2.5 hover:bg-muted/50">
            <span className="absolute top-4 -left-[21px] size-2.5 rounded-full bg-muted-foreground/40" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.label || "Editing session"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {when.format(new Date(v.createdAt))} · {v.label ? "saved" : "autosaved"}
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled={!canRestore || restore.isPending} onClick={() => setConfirm(v)}>
              <RotateCcw data-icon="inline-start" /> Restore
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete version ${v.label || "Editing session"}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(v.id, { onError: () => toast.error("Couldn't delete the version.") })}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
        {versions.data?.length === 0 && (
          <li className="p-2.5 text-xs text-muted-foreground">No earlier versions yet. Your next editing session is kept automatically.</li>
        )}
        {versions.isError && <li className="p-2.5 text-xs text-destructive">Couldn&apos;t load history.</li>}
      </ol>
      <p className="text-xs text-muted-foreground">
        Autosaves are grouped by editing session and kept for 90 days. Named versions stay until you delete them. Restoring saves the
        current state first.
      </p>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore “{confirm?.label || "Editing session"}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The resume goes back to this version. Your current version is saved as “Before restoring”, so you can undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return
                restore.mutate(confirm.id, {
                  onSuccess: (r) => {
                    onRestored(r)
                    toast.success("Version restored")
                  },
                  onError: () => toast.error("Couldn't restore that version."),
                })
                setConfirm(null)
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
