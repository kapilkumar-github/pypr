"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Check, FileText, ScanSearch } from "lucide-react"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FormAlert } from "@/components/common/form-alert"
import { UploadResumeButton } from "@/components/resume/upload-resume-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { useResumes } from "@/lib/api/resumes"
import { useCreateWorkspace, type WorkspaceInput } from "@/lib/api/workspaces"
import type { ResumeData } from "@/lib/resume/types"
import { readPosting } from "@/lib/resume/job-match"
import { cn } from "@/lib/utils"
import { contextFromResume, defaultName, isSoftwareProfile, seniorityFor } from "@/lib/workspace/meta"

type ResumeOption = { id: string; title: string; data: ResumeData }

const noSubscribe = () => () => {}

/** The posting the user last pasted in Job match (same browser tab). */
function savedPosting(): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem("pypr:job-match") ?? "null")
    return typeof saved?.posting === "string" ? saved.posting.trim() : ""
  } catch {
    return ""
  }
}

/** Create flow. `?resume=<id>` preselects and prefills from a resume; `?from=job-match` brings the posting. */
export function CreateWorkspace() {
  const params = useSearchParams()
  const resumes = useResumes()
  const fromJob = params.get("from") === "job-match"
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false)

  if (resumes.isPending || !hydrated) {
    return (
      <Shell>
        <Skeleton className="h-96 rounded-xl" />
      </Shell>
    )
  }
  const list = resumes.data ?? []
  const preselected = list.find((r) => r.id === params.get("resume")) ?? null
  return (
    <Shell fromJob={fromJob}>
      <CreateForm resumes={list} preselected={preselected} posting={fromJob ? savedPosting() : ""} />
    </Shell>
  )
}

function Shell({ fromJob, children }: { fromJob?: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link href="/workspaces">
          <ArrowLeft data-icon="inline-start" /> Workspaces
        </Link>
      </Button>
      <PageHeader
        title="New workspace"
        description="One workspace per role you're preparing for. Choose a resume and we'll work out the role, level and skills from it. Workspaces currently support software engineering profiles only."
      />
      {fromJob && (
        <p className="flex items-center gap-2 rounded-lg border bg-accent/40 px-3 py-2 text-sm">
          <ScanSearch className="size-4 text-primary" /> The job posting from Job match will be saved with this workspace
        </p>
      )}
      {children}
    </div>
  )
}

/** Everything about the person comes from the resume: role, level, years, skills. No AI call. */
function inputFromResume(name: string, resume: ResumeOption, posting: string): WorkspaceInput {
  const ctx = contextFromResume(resume.data)
  const job = posting.length >= 40 ? readPosting(posting) : null
  const role = job?.title || ctx.currentRole || resume.data.personalInfo.jobTitle.trim() || name
  const { seniority, track } = seniorityFor(ctx.currentRole, ctx.years)
  const technologies = ctx.skills.slice(0, 20)
  return {
    name: name.trim() || defaultName(role, technologies),
    targetRole: role.slice(0, 120),
    seniority,
    track,
    yearsExperience: ctx.years,
    technologies,
    objectives: "",
    jobDescription: posting,
    modules: [],
    resumeIds: [resume.id],
    skills: ctx.skills.slice(0, 40).map((n) => ({ name: n, area: "" })),
  }
}

function CreateForm({ resumes, preselected, posting }: { resumes: ResumeOption[]; preselected: ResumeOption | null; posting: string }) {
  const router = useRouter()
  const verified = useVerified()
  const create = useCreateWorkspace()
  const [name, setName] = useState("")
  const [uploaded, setUploaded] = useState<ResumeOption[]>([])
  const [selectedId, setSelectedId] = useState(preselected?.id ?? "")
  const options = [...uploaded, ...resumes.filter((r) => !uploaded.some((u) => u.id === r.id))]
  const selected = options.find((r) => r.id === selectedId) ?? null
  const errors = fieldErrors(create.error)
  const unsupported = selected !== null && !isSoftwareProfile(selected.data)

  return (
    <form
      className="space-y-6 rounded-xl border bg-card p-5 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault()
        if (!selected || unsupported) return
        if (!verified) return verifyFirst()
        create.mutate(inputFromResume(name, selected, posting), { onSuccess: (w) => router.push(`/workspaces/${w.id}?created=1`) })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="e.g. Lead engineer interviews"
          aria-invalid={Boolean(errors.name)}
        />
        <p className="text-xs text-muted-foreground">Optional. We&apos;ll name it after the role if you leave it empty.</p>
      </div>

      <fieldset className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium">Resume</legend>
          <UploadResumeButton onImported={(r) => { setUploaded((u) => [r, ...u]); setSelectedId(r.id) }} />
        </div>
        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Upload a resume (PDF, Word or text) to continue. A workspace needs one.</p>
        ) : (
          <div role="radiogroup" aria-label="Resume" className="grid gap-2">
            {options.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={r.id === selectedId}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  r.id === selectedId ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium [overflow-wrap:anywhere]">{r.title}</span>
                  <span className="block break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{contextFromResume(r.data).currentRole || "No role on this resume yet"}</span>
                </span>
                {r.id === selectedId && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        )}
        {errors.resumeIds && <p className="text-xs text-destructive">{errors.resumeIds}</p>}
      </fieldset>

      {unsupported && (
        <FormAlert message="This resume doesn't look like a software engineering profile. Workspaces currently support software engineering roles only. Choose another resume or upload a different one." />
      )}
      {create.isError && !errors.resumeIds && <FormAlert message={errorMessage(create.error) ?? "Couldn't create the workspace."} />}
      <div className="flex gap-2">
        <Button type="submit" disabled={!selected || unsupported || create.isPending || create.isSuccess}>
          {create.isPending || create.isSuccess ? "Creating…" : "Create workspace"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href="/workspaces">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
