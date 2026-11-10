"use client"

import { useState } from "react"
import Link from "next/link"
import { Clock, Copy, EllipsisVertical, FilePen, Pencil, Target, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ResumeThumbnail } from "@/components/resume/document/resume-thumbnail"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { useCreateResume, useDeleteResume, type ResumeSummary } from "@/lib/api/resumes"
import { timeAgo } from "@/lib/resume/format"
import { TEMPLATES } from "@/lib/resume/types"
import { cn } from "@/lib/utils"

export type ResumeLayout = "grid" | "list"

function useResumeActions(resume: ResumeSummary) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteResume()
  const create = useCreateResume()
  const verified = useVerified()

  const duplicate = () => {
    if (!verified) {
      verifyFirst()
      return
    }
    create.mutate(
      { title: `${resume.title} (copy)`.slice(0, 200), data: resume.data },
      {
        onSuccess: () => toast.success("Resume duplicated"),
        onError: () => toast.error("Couldn't duplicate the resume. Try again."),
      },
    )
  }

  const dialog = (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{resume.title}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>This permanently deletes the resume. You can&apos;t undo this.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              remove.mutate(resume.id, {
                onSuccess: () => toast.success("Resume deleted"),
                onError: () => toast.error("Couldn't delete the resume. Try again."),
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { duplicate, duplicating: create.isPending, confirmDelete: () => (verified ? setConfirming(true) : verifyFirst()), dialog }
}

function ActionsMenu({
  resume,
  onDuplicate,
  onDelete,
}: {
  resume: ResumeSummary
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative z-10" aria-label={`Actions for ${resume.title}`}>
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/resumes/${resume.id}`}>
            <Pencil /> Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={prepareHref(resume)}>
            <Target /> Prepare for a role
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TemplateBadge({ id }: { id: string }) {
  const name = TEMPLATES.find((t) => t.id === id)?.name
  if (!name) return null
  return (
    <Badge variant="secondary" className="gap-1.5 text-[11px] font-bold tracking-wide uppercase">
      <span className="size-1.5 rounded-full bg-primary" />
      {name}
    </Badge>
  )
}

const editHref = (r: ResumeSummary) => `/resumes/${r.id}`
// Opens the workspace form prefilled from this resume; nothing is created until the user confirms.
const prepareHref = (r: ResumeSummary) => `/workspaces/new?resume=${encodeURIComponent(r.id)}`

/** Resume in the list: a card with a live thumbnail (grid) or a compact row (list). */
export function ResumeCard({ resume, layout = "grid" }: { resume: ResumeSummary; layout?: ResumeLayout }) {
  const { duplicate, duplicating, confirmDelete, dialog } = useResumeActions(resume)
  const updated = timeAgo(resume.updatedAt)
  const paper = resume.data.settings.paperSize === "letter" ? "Letter" : "A4"

  const titleLink = (
    <Link
      href={editHref(resume)}
      className="block truncate text-sm font-semibold outline-none group-hover:text-primary after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
    >
      {resume.title}
    </Link>
  )

  if (layout === "list") {
    return (
      <Card className="group relative flex-row items-center gap-4 p-3 shadow-xs transition-shadow hover:shadow-md">
        <div className="h-16 w-12 shrink-0 rounded-md bg-muted p-1">
          <ResumeThumbnail data={resume.data} />
        </div>
        <div className="min-w-0 flex-1">
          {titleLink}
          <p className="truncate text-xs text-muted-foreground">{resume.jobTitle || "No job title yet"}</p>
        </div>
        <div className="hidden sm:block">
          <TemplateBadge id={resume.template} />
        </div>
        <span className="hidden w-28 items-center gap-1 text-xs text-muted-foreground md:flex">
          <Clock className="size-3.5" /> {updated}
        </span>
        <ActionsMenu resume={resume} onDuplicate={duplicate} onDelete={confirmDelete} />
        {dialog}
      </Card>
    )
  }

  return (
    <Card className="group relative gap-0 p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <TemplateBadge id={resume.template} />
          <Badge variant="outline" className="text-[11px] text-muted-foreground">
            {paper}
          </Badge>
        </div>
        <ActionsMenu resume={resume} onDuplicate={duplicate} onDelete={confirmDelete} />
      </div>

      <div className="h-52 rounded-lg border bg-muted p-3 pb-0">
        <ResumeThumbnail data={resume.data} />
      </div>

      <div className="mt-4 min-w-0">
        {titleLink}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Target: <span className="font-medium text-foreground">{resume.jobTitle || "No job title yet"}</span>
        </p>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Clock className="size-3.5" /> Updated {updated}
        </p>
      </div>

      <div className="relative z-10 mt-4 flex items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" asChild className="text-primary">
            <Link href={editHref(resume)}>
              <FilePen data-icon="inline-start" /> Edit
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={prepareHref(resume)}>
              <Target data-icon="inline-start" /> Prepare for a role
            </Link>
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={duplicate}
              disabled={duplicating}
              aria-label={`Duplicate ${resume.title}`}
              className={cn(duplicating && "animate-pulse")}
            >
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Duplicate</TooltipContent>
        </Tooltip>
      </div>
      {dialog}
    </Card>
  )
}
