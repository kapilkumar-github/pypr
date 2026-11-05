"use client"

import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight, CircleAlert, CircleCheck, FileText, LoaderCircle, RotateCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { PageHeader } from "@/components/common/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api/client"
import { analyzePosting } from "@/lib/api/job-match"
import { useResumes, type ResumeSummary } from "@/lib/api/resumes"
import { fromAi, matchResume, readPosting, type JobRequirements, type Requirement, type ResumeMatch } from "@/lib/resume/job-match"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "pypr:job-match"
const MIN_POSTING = 40

type Saved = { posting: string; ai: { posting: string; req: JobRequirements } | null }

// The posting is kept for the browser tab (sessionStorage), so opening a resume and coming back keeps it.
function loadSaved(): Saved {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")
    if (saved && typeof saved.posting === "string") return { posting: saved.posting, ai: saved.ai ?? null }
  } catch {}
  return { posting: "", ai: null }
}

const noSubscribe = () => () => {}

/** Job match: paste a posting, see every resume ranked by how well it covers the requirements. */
export function JobMatchView() {
  // sessionStorage exists only in the browser: render the form after hydration.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false)
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8" aria-busy="true">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }
  return <JobMatch initial={loadSaved()} />
}

function JobMatch({ initial }: { initial: Saved }) {
  const resumes = useResumes()
  const verified = useVerified()
  const [posting, setPosting] = useState(initial.posting)
  // AI results belong to the posting they were run on; editing the posting falls back to the instant reading.
  const [ai, setAi] = useState(initial.ai)

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ posting, ai }))
  }, [posting, ai])

  const deferred = useDeferredValue(posting)
  const ready = deferred.trim().length >= MIN_POSTING
  const aiCurrent = ai && ai.posting === deferred ? ai.req : null
  const req = useMemo(() => aiCurrent ?? (ready ? readPosting(deferred) : null), [aiCurrent, ready, deferred])

  const ranked = useMemo(() => {
    if (!req || !resumes.data) return []
    return resumes.data
      .map((resume) => ({ resume, match: matchResume(resume.data, req) }))
      .sort((a, b) => b.match.score - a.match.score || b.resume.updatedAt.localeCompare(a.resume.updatedAt))
  }, [req, resumes.data])

  const analyze = useMutation({
    mutationFn: (text: string) => analyzePosting(text),
    onSuccess: (result, text) => setAi({ posting: text, req: fromAi(result) }),
    onError: (err) => toast.error(errorMessage(err) ?? "Couldn't analyze the posting."),
  })
  const runAi = () => (verified ? analyze.mutate(posting) : verifyFirst())

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Job match"
        description="Paste a job posting to see which of your resumes fits it best, and what each one is missing."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="space-y-4" aria-label="Job posting">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <label htmlFor="posting" className="text-sm font-semibold">
              Job posting
            </label>
            <Textarea
              id="posting"
              placeholder="Paste the full job description…"
              value={posting}
              maxLength={20000}
              onChange={(e) => setPosting(e.target.value)}
              className="min-h-64 text-sm"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {posting.trim().length < MIN_POSTING
                  ? "Paste at least a few lines."
                  : aiCurrent
                    ? "Matched with the AI's reading of this posting."
                    : "Matched instantly. AI reads it more carefully."}
              </p>
              <Button
                size="sm"
                variant={aiCurrent ? "outline" : "default"}
                onClick={runAi}
                disabled={posting.trim().length < MIN_POSTING || analyze.isPending}
                aria-busy={analyze.isPending}
              >
                {analyze.isPending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : aiCurrent ? <RotateCw data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                {analyze.isPending ? "Analyzing… (up to a minute)" : aiCurrent ? "Run AI again" : "Analyze with AI"}
              </Button>
            </div>
          </div>

          {req && <RequirementsCard req={req} />}
        </section>

        <section className="space-y-3" aria-label="Resumes ranked">
          {resumes.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          {resumes.isError && <FormAlert message={errorMessage(resumes.error) ?? "Couldn't load your resumes."} />}
          {resumes.data?.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No resumes yet"
              description="Create or upload a resume first, then match it against jobs here."
              action={
                <Button asChild>
                  <Link href="/resumes">Go to resumes</Link>
                </Button>
              }
            />
          )}
          {!!resumes.data?.length && !req && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Your {resumes.data.length === 1 ? "resume" : `${resumes.data.length} resumes`} will be ranked here.
            </p>
          )}
          {req && req.items.length === 0 && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No known skills found in this posting. Try <span className="font-medium text-foreground">Analyze with AI</span>.
            </p>
          )}
          {req &&
            req.items.length > 0 &&
            ranked.map(({ resume, match }, i) => <ResultCard key={resume.id} resume={resume} match={match} minYears={req.minYears} best={i === 0 && match.score > (ranked[1]?.match.score ?? -1)} />)}
        </section>
      </div>
    </div>
  )
}

function RequirementsCard({ req }: { req: JobRequirements }) {
  const required = req.items.filter((r) => r.required)
  const nice = req.items.filter((r) => !r.required)
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">What the job asks for</p>
        <Badge variant={req.source === "ai" ? "default" : "secondary"}>
          {req.source === "ai" ? (
            <>
              <Sparkles /> AI analysis
            </>
          ) : (
            "Instant"
          )}
        </Badge>
      </div>
      {(req.title || req.minYears > 0) && (
        <p className="text-sm text-muted-foreground">
          {[req.title, req.minYears > 0 && `${req.minYears}+ years`].filter(Boolean).join(" · ")}
        </p>
      )}
      <Chips title={`Required (${required.length})`} items={required} />
      <Chips title={`Nice to have (${nice.length})`} items={nice} />
      {req.source === "rules" && (
        <p className="text-xs text-muted-foreground">Found with a built-in list of common skills. AI analysis also catches skills it doesn&apos;t know.</p>
      )}
    </div>
  )
}

function Chips({ title, items, tone }: { title: string; items: Requirement[]; tone?: "success" | "warning" }) {
  if (!items.length) return null
  return (
    <div>
      {title && <p className="mb-1.5 text-xs text-muted-foreground">{title}</p>}
      <ul className="flex flex-wrap gap-1">
        {items.map((r) => (
          <li
            key={r.name}
            className={cn(
              "rounded px-1.5 py-0.5 text-xs",
              tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-muted text-foreground",
              !r.required && "opacity-80",
            )}
          >
            {r.name}
            {!r.required && tone && <span className="sr-only"> (nice to have)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultCard({ resume, match, minYears, best }: { resume: ResumeSummary; match: ResumeMatch; minYears: number; best: boolean }) {
  const short = minYears > 0 && match.years !== null && match.years < minYears
  return (
    <article className={cn("space-y-3 rounded-xl border bg-card p-4", best && "border-primary/50 ring-1 ring-primary/20")}>
      <div className="flex items-start gap-3">
        <Score value={match.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold">{resume.title}</h2>
            {best && match.score > 0 && <Badge>Best match</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{resume.data.personalInfo.jobTitle || "No headline"}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {match.covered.length} of {match.covered.length + match.missing.length} requirements
            {match.years !== null && (
              <span className={cn("ml-1 flex items-center gap-1", short && "text-warning")}>
                · {match.years} years of experience
                {short && <CircleAlert className="size-3" aria-label={`Job asks for ${minYears}+`} />}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/resumes/${resume.id}`}>
            Open <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CircleCheck className="size-3.5 text-success" /> Covered
          </p>
          {match.covered.length ? <Chips title="" items={match.covered} tone="success" /> : <p className="text-xs text-muted-foreground">Nothing yet</p>}
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CircleAlert className="size-3.5 text-warning" /> Missing
          </p>
          {match.missing.length ? <Chips title="" items={match.missing} tone="warning" /> : <p className="text-xs text-muted-foreground">Nothing. Covers every requirement.</p>}
        </div>
      </div>
    </article>
  )
}

function Score({ value }: { value: number }) {
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-full border-4 font-mono text-sm font-bold",
        value >= 70 ? "border-success text-success" : value >= 40 ? "border-warning text-warning" : "border-destructive/60 text-destructive",
      )}
      role="img"
      aria-label={`Match ${value} out of 100`}
    >
      {value}
    </div>
  )
}
