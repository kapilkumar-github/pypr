"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  History,
  ListChecks,
  LoaderCircle,
  Palette,
  PenLine,
  PencilLine,
  Printer,
  Share2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCreateResume, useDeleteResume } from "@/lib/api/resumes"
import { blankResume, softwareEngineerExample } from "@/lib/resume/defaults"
import type { ResumeData } from "@/lib/resume/types"
import { cn } from "@/lib/utils"

export type BuilderMode = "write" | "design" | "check" | "share"
/** Small screens show either the side panel or the preview. */
export type BuilderView = "panel" | "preview"

const MODES = [
  { id: "write", name: "Write", icon: <PenLine /> },
  { id: "design", name: "Design", icon: <Palette /> },
  { id: "check", name: "Check", icon: <ListChecks /> },
  { id: "share", name: "Share", icon: <Share2 /> },
] as const

type Replacement = { title: string; description: string; data: ResumeData; keepSettings: boolean }

/**
 * Builder top bar. Left: back, title (with document menu) and save status.
 * Center: Write / Design / Check / Share. Right: preview toggle (small screens), History and Download.
 */
export function BuilderHeader({
  id,
  title,
  onTitleChange,
  titleValid,
  readOnly,
  status,
  mode,
  onModeChange,
  view,
  onViewChange,
  data,
  onReplace,
  onPrint,
  onDownloadPdf,
  pdfBusy,
  onOpenSheet,
  onDeleted,
}: {
  id: string
  title: string
  onTitleChange: (title: string) => void
  titleValid: boolean
  /** Unverified email: no renaming, duplicating, replacing or deleting. */
  readOnly: boolean
  status: React.ReactNode
  mode: BuilderMode
  onModeChange: (mode: BuilderMode) => void
  view: BuilderView
  onViewChange: (view: BuilderView) => void
  data: ResumeData
  /** Replaces the resume content; samples keep the current design settings, imports bring their own. */
  onReplace: (data: ResumeData, keepSettings: boolean) => void
  /** Browser print dialog (document menu). */
  onPrint: () => void
  /** Server-rendered PDF download (main Download button). */
  onDownloadPdf: () => void
  pdfBusy: boolean
  /** Opens the Download & history sheet on a tab. */
  onOpenSheet: (tab: "download" | "history") => void
  /** Called once the resume is deleted, before leaving the page, so pending edits aren't saved. */
  onDeleted: () => void
}) {
  const router = useRouter()
  const titleInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Replacement | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const create = useCreateResume()
  const remove = useDeleteResume()

  const duplicate = () =>
    create.mutate(
      { title: `${title.trim() || "Untitled"} (copy)`.slice(0, 200), data },
      {
        onSuccess: (copy) => {
          toast.success("Duplicated. You're now editing the copy.")
          router.push(`/resumes/${copy.id}`)
        },
        onError: () => toast.error("Couldn't duplicate this resume."),
      },
    )

  return (
    <header
      className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b bg-background px-2 sm:px-3"
      data-print="hide"
    >
      <div className="flex min-w-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/resumes" aria-label="Back to resumes">
                <ArrowLeft />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to resumes</TooltipContent>
        </Tooltip>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center">
            <Input
              ref={titleInput}
              aria-label="Resume title"
              aria-invalid={!titleValid || undefined}
              value={title}
              readOnly={readOnly}
              maxLength={200}
              onChange={(e) => onTitleChange(e.target.value)}
              className="h-6 w-36 min-w-0 rounded-md border-transparent bg-transparent px-1 text-sm font-semibold shadow-none hover:border-input focus-visible:border-ring sm:w-56 dark:bg-transparent"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`Document menu: ${title}`}>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem disabled={readOnly} onSelect={() => setTimeout(() => titleInput.current?.select(), 0)}>
                  <PencilLine /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={duplicate} disabled={readOnly || create.isPending}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onPrint}>
                  <Printer /> Print
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  Replace content
                </DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={readOnly}
                  onSelect={() =>
                    setPending({
                      title: "Load the Software Engineer example?",
                      description: "This replaces everything in this resume with the example content.",
                      data: softwareEngineerExample(),
                      keepSettings: true,
                    })
                  }
                >
                  <FileText /> Software Engineer example
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={readOnly}
                  onSelect={() =>
                    setPending({
                      title: "Clear this resume?",
                      description: "This removes all content. Your template and design settings stay.",
                      data: blankResume(),
                      keepSettings: true,
                    })
                  }
                >
                  <FilePlus2 /> Start from blank
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={readOnly} onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete resume
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="hidden px-1 sm:block">{status}</div>
        </div>
      </div>

      <Segmented
        label="Builder mode"
        value={mode}
        options={MODES}
        onChange={onModeChange}
        className="border bg-muted/50 [&>button]:px-2.5 [&>button]:py-1.5 max-md:[&>button]:text-[0px] max-md:[&>button]:gap-0"
      />

      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("lg:hidden", view === "preview" && "bg-muted text-foreground")}
          aria-label="Show preview"
          aria-pressed={view === "preview"}
          onClick={() => onViewChange(view === "preview" ? "panel" : "preview")}
        >
          <Eye />
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="History" onClick={() => onOpenSheet("history")}>
              <History />
            </Button>
          </TooltipTrigger>
          <TooltipContent>History</TooltipContent>
        </Tooltip>

        <div className="flex">
          <Button size="sm" className="rounded-r-none" onClick={onDownloadPdf} disabled={pdfBusy} aria-busy={pdfBusy}>
            {pdfBusy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                className="rounded-l-none border-l border-primary-foreground/20"
                aria-label="More download formats"
                onClick={() => onOpenSheet("download")}
              >
                <ChevronDown />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Word, Markdown, text, JSON</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onReplace(pending.data, pending.keepSettings)
                setPending(null)
              }}
            >
              Replace content
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title.trim() || "Untitled"}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the resume. You can&apos;t undo this.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                remove.mutate(id, {
                  onSuccess: () => {
                    onDeleted()
                    toast.success("Resume deleted")
                    router.replace("/resumes")
                  },
                  onError: () => toast.error("Couldn't delete this resume."),
                })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
