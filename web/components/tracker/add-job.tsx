"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { ArrowLeft, CircleAlert, CircleCheck, Link2, PenLine, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { FormAlert } from "@/components/common/form-alert"
import { PageHeader } from "@/components/common/page-header"
import { SubmitButton } from "@/components/common/submit-button"
import { TextField } from "@/components/common/text-field"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { extractJob, findDuplicates, useCreateJob, type Duplicate, type Extraction, type JobInput } from "@/lib/api/tracker"
import { emptyJob, sourceName, statusName } from "@/lib/tracker/meta"
import { cn } from "@/lib/utils"
import { JobForm } from "./job-form"

const REASONS: Record<Duplicate["reason"], string> = {
  url: "Same job link",
  external_id: "Same job ID on the same site",
  company_title: "Same company and title (may be a different opening)",
}

export function AddJob() {
  const router = useRouter()
  const [step, setStep] = useState<"url" | "review">("url")
  const [url, setUrl] = useState("")
  const [extraction, setExtraction] = useState<Extraction | null>(null)
  const [job, setJob] = useState<JobInput>(emptyJob)
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)

  const extract = useMutation({
    mutationFn: extractJob,
    onSuccess: (res) => {
      setExtraction(res)
      setJob({ ...emptyJob(), ...res.fields })
      setStep("review")
    },
  })
  const dupCheck = useMutation({ mutationFn: findDuplicates })
  const create = useCreateJob()

  const save = (force: boolean) => {
    const done = () =>
      create.mutate(job, {
        onSuccess: (d) => {
          toast.success("Job saved")
          router.push(`/job-tracker/${d.id}`)
        },
      })
    if (force) return done()
    dupCheck.mutate(
      {
        discoveryUrl: job.discoveryUrl,
        applicationUrl: job.applicationUrl,
        source: job.source,
        externalId: job.externalId,
        company: job.company,
        title: job.title,
      },
      {
        onSuccess: (found) => {
          setDuplicates(found)
          if (found.length === 0) done()
        },
        // The check is advisory; don't block saving when it fails.
        onError: done,
      },
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/job-tracker">
            <ArrowLeft data-icon="inline-start" /> Job tracker
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow="Job tracker"
        title="Add a job"
        description="Paste a link to read the public listing, or enter the details yourself. Nothing is saved until you review it."
      />

      {step === "url" ? (
        <Card className="gap-4 p-4 shadow-xs sm:p-6">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={(e) => {
              e.preventDefault()
              extract.mutate(url.trim())
            }}
          >
            <div className="flex-1">
              <TextField
                id="job-url"
                type="url"
                label="Job link"
                placeholder="https://boards.greenhouse.io/company/jobs/123"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                error={fieldErrors(extract.error).url}
                description="Works best with public listings that publish structured job data (many Greenhouse, Lever, Ashby and company career pages). Sign-in pages and some sites can't be read."
              />
            </div>
            <SubmitButton pending={extract.isPending} className="sm:mt-6">
              <Link2 data-icon="inline-start" /> Read job
            </SubmitButton>
          </form>
          <FormAlert message={errorMessage(extract.error)} />
          <div className="flex items-center gap-3 border-t pt-4 text-sm text-muted-foreground">
            No link, or prefer typing?
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExtraction(null)
                setJob(emptyJob())
                setStep("review")
              }}
            >
              <PenLine data-icon="inline-start" /> Enter manually
            </Button>
          </div>
        </Card>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            save(false)
          }}
        >
          {extraction && <ExtractionNotice extraction={extraction} />}
          <Card className="p-4 shadow-xs sm:p-6">
            <JobForm value={job} onChange={setJob} errors={fieldErrors(create.error)} mode="create" />
          </Card>

          {duplicates && duplicates.length > 0 && (
            <div role="alert" className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                <TriangleAlert className="size-4" /> You may already be tracking this job
              </p>
              <ul className="space-y-2">
                {duplicates.map((d) => (
                  <li key={d.id} className="rounded-lg bg-card p-3 text-sm">
                    <Link href={`/job-tracker/${d.id}`} target="_blank" className="font-medium hover:underline">
                      {d.title} · {d.company}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {REASONS[d.reason]} · {statusName(d.status)}
                      {d.location && ` · ${d.location}`}
                      {d.externalId && ` · ${sourceName(d.source) || "ID"} ${d.externalId}`}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => save(true)} disabled={create.isPending}>
                  Save anyway
                </Button>
                <Button type="button" variant="outline" onClick={() => setDuplicates(null)}>
                  Keep editing
                </Button>
              </div>
            </div>
          )}

          <FormAlert message={errorMessage(create.error)} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("url")}>
              Back
            </Button>
            <SubmitButton pending={create.isPending || dupCheck.isPending}>Save job</SubmitButton>
          </div>
        </form>
      )}
    </div>
  )
}

function ExtractionNotice({ extraction: x }: { extraction: Extraction }) {
  const tone =
    x.status === "ok"
      ? "border-success/30 bg-success/10 text-success"
      : x.status === "partial"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-destructive/30 bg-destructive/10 text-destructive"
  const Icon = x.status === "ok" ? CircleCheck : x.status === "partial" ? TriangleAlert : CircleAlert
  const text =
    x.status === "ok"
      ? "Read from the listing's structured job data. Check each field before saving; anything the listing didn't state is left blank."
      : x.message
  return (
    <p role="status" className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", tone)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}
