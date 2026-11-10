"use client"

import { useState } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/common/form-alert"
import { Segmented } from "@/components/common/segmented"
import { SubmitButton } from "@/components/common/submit-button"
import { TextField } from "@/components/common/text-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { useResumes } from "@/lib/api/resumes"
import { useAttachResume, useConfirmApply, type ResumeChoice, type TrackedJob } from "@/lib/api/tracker"

type Kind = ResumeChoice["kind"]

const KINDS = [
  { id: "pypr", name: "Pypr resume" },
  { id: "external", name: "Another file" },
  { id: "none", name: "No resume" },
] as const

/** Picks which resume went with an application: a Pypr resume (copied now), an outside file, or none. */
function ResumeChoiceFields({
  idPrefix,
  kind,
  setKind,
  resumeId,
  setResumeId,
  label,
  setLabel,
  errors,
}: {
  idPrefix: string
  kind: Kind
  setKind: (k: Kind) => void
  resumeId: string
  setResumeId: (id: string) => void
  label: string
  setLabel: (l: string) => void
  errors: Record<string, string>
}) {
  const resumes = useResumes()
  return (
    <div className="space-y-3">
      <Segmented label="Resume used" value={kind} options={KINDS} onChange={setKind} className="w-fit" />
      {kind === "pypr" && (
        <Field data-invalid={errors.resumeId ? true : undefined}>
          <FieldLabel htmlFor={`${idPrefix}-resume`}>Resume</FieldLabel>
          <Select value={resumeId} onValueChange={setResumeId} disabled={resumes.isPending}>
            <SelectTrigger id={`${idPrefix}-resume`} className="w-full" aria-invalid={errors.resumeId ? true : undefined}>
              <SelectValue placeholder={resumes.isPending ? "Loading resumes…" : "Choose a resume"} />
            </SelectTrigger>
            <SelectContent>
              {resumes.data?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {resumes.data?.length === 0 && <FieldDescription>You have no Pypr resumes yet.</FieldDescription>}
          {errors.resumeId && <FieldError>{errors.resumeId}</FieldError>}
        </Field>
      )}
      {kind === "external" && (
        <TextField
          id={`${idPrefix}-label`}
          label="Which resume?"
          placeholder="e.g. resume-2026-acme.pdf"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          error={errors.label}
          maxLength={200}
        />
      )}
    </div>
  )
}

function choice(kind: Kind, resumeId: string, label: string): ResumeChoice {
  if (kind === "pypr") return { kind, resumeId }
  if (kind === "external") return { kind, label }
  return { kind: "none" }
}

function nowLocal() {
  const d = new Date()
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/**
 * Confirms the user submitted the application on the employer's site. Records the applied date and a
 * snapshot of the resume used, in one request.
 */
export function ApplyDialog({ job, open, onOpenChange }: { job: TrackedJob; open: boolean; onOpenChange: (o: boolean) => void }) {
  const apply = useConfirmApply()
  const [when, setWhen] = useState(nowLocal)
  const [kind, setKind] = useState<Kind>(job.resumeId ? "pypr" : "none")
  const [resumeId, setResumeId] = useState(job.resumeId ?? "")
  const [label, setLabel] = useState("")
  const errors = fieldErrors(apply.error)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    apply.mutate(
      { id: job.id, appliedAt: when ? new Date(when).toISOString() : null, resume: choice(kind, resumeId, label) },
      {
        onSuccess: () => {
          toast.success(`Marked as applied to ${job.company}`)
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Confirm you applied</DialogTitle>
            <DialogDescription>
              Only confirm after submitting on the employer&apos;s site. The resume you pick is saved as the submitted
              version; later edits to it won&apos;t change this record.
            </DialogDescription>
          </DialogHeader>
          <TextField
            id="apply-when"
            type="datetime-local"
            label="Submitted on"
            value={when}
            max={nowLocal()}
            onChange={(e) => setWhen(e.target.value)}
            error={errors.appliedAt}
            description="Your local time. You can correct it later."
          />
          <ResumeChoiceFields
            idPrefix="apply"
            kind={kind}
            setKind={setKind}
            resumeId={resumeId}
            setResumeId={setResumeId}
            label={label}
            setLabel={setLabel}
            errors={errors}
          />
          <FormAlert message={errorMessage(apply.error)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={apply.isPending}>Confirm applied</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Records a resume after the application was submitted. It's labelled as added later. */
export function AttachResumeDialog({ job, open, onOpenChange }: { job: TrackedJob; open: boolean; onOpenChange: (o: boolean) => void }) {
  const attach = useAttachResume(job.id)
  const [kind, setKind] = useState<Kind>("pypr")
  const [resumeId, setResumeId] = useState(job.resumeId ?? "")
  const [label, setLabel] = useState("")
  const errors = fieldErrors(attach.error)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            attach.mutate(choice(kind, resumeId, label), {
              onSuccess: () => {
                toast.success("Resume added")
                onOpenChange(false)
              },
            })
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add a resume record</DialogTitle>
            <DialogDescription>
              This is saved as added after applying, so it won&apos;t be shown as the version you submitted.
            </DialogDescription>
          </DialogHeader>
          <ResumeChoiceFields
            idPrefix="attach"
            kind={kind}
            setKind={setKind}
            resumeId={resumeId}
            setResumeId={setResumeId}
            label={label}
            setLabel={setLabel}
            errors={errors}
          />
          <FormAlert message={errorMessage(attach.error)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={attach.isPending}>Add record</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
