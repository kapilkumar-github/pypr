"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  CalendarPlus,
  ExternalLink,
  FileText,
  History,
  MessageSquare,
  Pencil,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Video,
} from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { SubmitButton } from "@/components/common/submit-button"
import { TextField } from "@/components/common/text-field"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/client"
import {
  useDeleteJob,
  useInterviewChange,
  useNoteChange,
  useSetNextAction,
  useSnapshot,
  useTrackedJob,
  useUpdateJob,
  type Interview,
  type InterviewInput,
  type JobDetail as Detail,
  type JobInput,
  type ResumeSnapshot,
} from "@/lib/api/tracker"
import { normalizeResume } from "@/lib/resume/defaults"
import {
  arrangementName,
  browserTimeZone,
  formatDate,
  isoToZoned,
  jobToInput,
  safeHref,
  salaryText,
  sourceName,
  statusName,
  statusTone,
  timeZones,
  zonedToIso,
} from "@/lib/tracker/meta"
import { cn } from "@/lib/utils"
import { ApplyDialog, AttachResumeDialog } from "./apply-dialog"
import { DueBadge } from "./due-badge"
import { JobForm } from "./job-form"
import { StatusSelect } from "./status-select"

const dateTime: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }

export function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const job = useTrackedJob(id)

  if (job.isPending) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading job">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }
  if (job.isError) {
    const missing = job.error instanceof ApiError && job.error.status === 404
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 p-4 sm:p-6 lg:p-8">
        {missing ? (
          <EmptyState
            icon={FileText}
            title="Job not found"
            description="It may have been deleted."
            action={
              <Button asChild variant="outline">
                <Link href="/job-tracker">Back to job tracker</Link>
              </Button>
            }
          />
        ) : (
          <>
            <FormAlert message={errorMessage(job.error) ?? "Couldn't load this job."} />
            <Button variant="outline" onClick={() => job.refetch()}>
              <RotateCw data-icon="inline-start" /> Try again
            </Button>
          </>
        )}
      </div>
    )
  }
  return <Loaded job={job.data} />
}

function Loaded({ job }: { job: Detail }) {
  const [editing, setEditing] = useState(false)
  const [applying, setApplying] = useState(false)
  const applyHref = safeHref(job.applicationUrl) ?? safeHref(job.discoveryUrl)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/job-tracker">
            <ArrowLeft data-icon="inline-start" /> Job tracker
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{job.company}</p>
          <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusTone(job.status))}>
              {statusName(job.status)}
            </span>
            {job.appliedAt && <span className="text-xs text-muted-foreground">Applied {formatDate(job.appliedAt, dateTime)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect job={job} size="default" />
          {applyHref && (
            <Button variant="outline" asChild>
              {/* Opening the page never marks the job as applied. */}
              <a href={applyHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink data-icon="inline-start" /> Open application page
              </a>
            </Button>
          )}
          {!job.resumes.some((r) => r.atSubmission) && (
            <Button onClick={() => setApplying(true)}>
              <Send data-icon="inline-start" /> I applied
            </Button>
          )}
        </div>
      </header>
      {applying && <ApplyDialog job={job} open onOpenChange={setApplying} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {editing ? (
            <EditJob job={job} onDone={() => setEditing(false)} />
          ) : (
            <Overview job={job} onEdit={() => setEditing(true)} />
          )}
          <Interviews job={job} />
          <Notes job={job} />
        </div>
        <aside className="space-y-6">
          <NextActionCard job={job} />
          <Resumes job={job} />
          <Activity job={job} />
          <DeleteJob job={job} />
        </aside>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, children, action }: { icon: typeof FileText; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" /> {children}
      </h2>
      {action}
    </div>
  )
}

function Overview({ job, onEdit }: { job: Detail; onEdit: () => void }) {
  const salary = salaryText(job)
  const rows: [string, React.ReactNode][] = [
    ["Location", job.location],
    ["Arrangement", arrangementName(job.workArrangement)],
    ["Employment type", job.employmentType],
    ["Salary", salary],
    ["Source", [sourceName(job.source), job.externalId && `ID ${job.externalId}`].filter(Boolean).join(" · ")],
    ["Application reference", job.applicationRef],
    ["Found at", job.discoveryUrl && <ExternalUrl url={job.discoveryUrl} />],
    ["Application page", job.applicationUrl && job.applicationUrl !== job.discoveryUrl && <ExternalUrl url={job.applicationUrl} />],
    ["Candidate portal", job.portalUrl && <ExternalUrl url={job.portalUrl} />],
    ["Saved", formatDate(job.createdAt, dateTime)],
  ]
  return (
    <Card className="gap-4 p-4 shadow-xs sm:p-6">
      <SectionTitle
        icon={FileText}
        action={
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil data-icon="inline-start" /> Edit
          </Button>
        }
      >
        Job details
      </SectionTitle>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="truncate">{v}</dd>
            </div>
          ))}
      </dl>
      <div className="space-y-1.5 border-t pt-4">
        <h3 className="text-xs font-semibold text-muted-foreground">Description</h3>
        {job.description ? (
          // Plain text from the API, rendered as text: nothing in it can run.
          <p className="max-h-[32rem] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">{job.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No description saved. Paste it with Edit so you keep it if the listing closes.</p>
        )}
      </div>
    </Card>
  )
}

function ExternalUrl({ url }: { url: string }) {
  const href = safeHref(url)
  if (!href) return url ? <span>{url}</span> : null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {new URL(href).host}
      {new URL(href).pathname.length > 1 ? "/…" : ""}
    </a>
  )
}

function EditJob({ job, onDone }: { job: Detail; onDone: () => void }) {
  const update = useUpdateJob(job.id)
  const [value, setValue] = useState<JobInput>(() => jobToInput(job))
  return (
    <Card className="p-4 shadow-xs sm:p-6">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate(value, {
            onSuccess: () => {
              toast.success("Job updated")
              onDone()
            },
          })
        }}
      >
        <JobForm value={value} onChange={setValue} errors={fieldErrors(update.error)} mode="edit" />
        <FormAlert message={errorMessage(update.error)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <SubmitButton pending={update.isPending}>Save changes</SubmitButton>
        </div>
      </form>
    </Card>
  )
}

function NextActionCard({ job }: { job: Detail }) {
  const set = useSetNextAction(job.id)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(job.nextAction.text)
  const [due, setDue] = useState(job.nextAction.due ?? "")
  const errors = fieldErrors(set.error)
  const a = job.nextAction

  const save = (input: { text: string; due: string | null; done: boolean }, after?: () => void) =>
    set.mutate(input, { onSuccess: after, onError: (e) => !Object.keys(fieldErrors(e)).length && toast.error(errorMessage(e) ?? "Couldn't save.") })

  return (
    <Card className="gap-3 p-4 shadow-xs">
      <SectionTitle icon={CalendarPlus}>Next action</SectionTitle>
      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save({ text, due: due || null, done: false }, () => setEditing(false))
          }}
        >
          <TextField id="next-text" label="What's next" placeholder="e.g. Follow up with the recruiter" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} error={errors.text} />
          <TextField id="next-due" type="date" label="Due" value={due} onChange={(e) => setDue(e.target.value)} error={errors.due} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <SubmitButton size="sm" pending={set.isPending}>
              Save
            </SubmitButton>
          </div>
        </form>
      ) : a.text ? (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={!!a.doneAt}
              disabled={set.isPending}
              onCheckedChange={(c) => save({ text: a.text, due: a.due, done: c === true })}
              className="mt-0.5"
            />
            <span className={cn(a.doneAt && "text-muted-foreground line-through")}>{a.text}</span>
          </label>
          <DueBadge action={a} />
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => { setText(a.text); setDue(a.due ?? ""); setEditing(true) }}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => save({ text: "", due: null, done: false })}>
              Clear
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Shown here and on the tracker. Pypr doesn&apos;t send reminders yet.</p>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => { setText(""); setDue(""); setEditing(true) }}>
          <Plus data-icon="inline-start" /> Set next action
        </Button>
      )}
    </Card>
  )
}

function snapshotLabel(s: ResumeSnapshot) {
  return s.kind === "pypr" ? s.title : s.kind === "external" ? s.label : "No resume"
}

function Resumes({ job }: { job: Detail }) {
  const [viewing, setViewing] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const submitted = job.resumes.some((r) => r.atSubmission)
  return (
    <Card className="gap-3 p-4 shadow-xs">
      <SectionTitle icon={FileText}>Resume</SectionTitle>
      <div className="space-y-1 text-sm">
        <p className="text-xs text-muted-foreground">Preparing</p>
        {job.resumeId ? (
          <Link href={`/resumes/${job.resumeId}`} className="font-medium text-primary hover:underline">
            {job.resumeTitle}
          </Link>
        ) : (
          <p className="text-muted-foreground">None selected. Choose one with Edit.</p>
        )}
      </div>
      {job.resumes.length > 0 && (
        <ul className="space-y-2 border-t pt-3">
          {job.resumes.map((s) => (
            <li key={s.id} className="space-y-0.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{snapshotLabel(s)}</span>
                {s.kind === "pypr" && (
                  <Button size="xs" variant="ghost" onClick={() => setViewing(s.id)}>
                    View
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                <Badge variant={s.atSubmission ? "secondary" : "outline"} className="mr-1 text-[10px]">
                  {s.atSubmission ? "Submitted version" : "Added after applying"}
                </Badge>
                {s.kind === "pypr" ? "Pypr copy" : s.kind === "external" ? "Outside file" : ""} · {formatDate(s.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {submitted && (
        <Button size="sm" variant="outline" onClick={() => setAttaching(true)}>
          <Plus data-icon="inline-start" /> Add resume record
        </Button>
      )}
      {attaching && <AttachResumeDialog job={job} open onOpenChange={setAttaching} />}
      <SnapshotDialog jobId={job.id} snapshotId={viewing} onClose={() => setViewing(null)} />
    </Card>
  )
}

function SnapshotDialog({ jobId, snapshotId, onClose }: { jobId: string; snapshotId: string | null; onClose: () => void }) {
  const snap = useSnapshot(jobId, snapshotId)
  return (
    <Dialog open={!!snapshotId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{snap.data?.title ?? "Resume"}</DialogTitle>
          <DialogDescription>
            {snap.data &&
              `${snap.data.atSubmission ? "Submitted version" : "Added after applying"}, copied ${formatDate(snap.data.createdAt, dateTime)}. Edits to the original resume don't change it.`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto rounded-lg bg-canvas p-3">
          {snap.isPending ? (
            <Skeleton className="aspect-[1/1.414] w-full" />
          ) : snap.isError ? (
            <FormAlert message={errorMessage(snap.error) ?? "Couldn't load the resume."} />
          ) : (
            <ResumeThumbnail data={normalizeResume(snap.data.data)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Activity({ job }: { job: Detail }) {
  return (
    <Card className="gap-3 p-4 shadow-xs">
      <SectionTitle icon={History}>Activity</SectionTitle>
      <ol className="space-y-2.5 border-l pl-4">
        {[...job.history].reverse().map((e) => (
          <li key={e.id} className="relative text-sm">
            <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" aria-hidden />
            <p>{e.from ? `${statusName(e.from)} → ${statusName(e.to)}` : `Added as ${statusName(e.to)}`}</p>
            <p className="text-[11px] text-muted-foreground">{formatDate(e.createdAt, dateTime)}</p>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function DeleteJob({ job }: { job: Detail }) {
  const router = useRouter()
  const del = useDeleteJob()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 data-icon="inline-start" /> Delete job
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this job?</AlertDialogTitle>
          <AlertDialogDescription>
            {job.title} at {job.company}, with its notes, interviews, history and resume records, will be removed. This
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              del.mutate(job.id, {
                onSuccess: () => {
                  toast.success("Job deleted")
                  router.push("/job-tracker")
                },
                onError: (e) => toast.error(errorMessage(e) ?? "Couldn't delete the job."),
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Notes({ job }: { job: Detail }) {
  const change = useNoteChange(job.id)
  const [body, setBody] = useState("")
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const errors = fieldErrors(change.error)
  return (
    <Card className="gap-4 p-4 shadow-xs sm:p-6">
      <SectionTitle icon={MessageSquare}>Notes</SectionTitle>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          change.mutate({ op: "add", body }, { onSuccess: () => setBody("") })
        }}
      >
        <Field data-invalid={!editing && errors.body ? true : undefined}>
          <FieldLabel htmlFor="new-note" className="sr-only">
            New note
          </FieldLabel>
          <Textarea id="new-note" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" maxLength={20000} />
          {!editing && errors.body && <FieldError>{errors.body}</FieldError>}
        </Field>
        <div className="flex justify-end">
          <SubmitButton size="sm" pending={change.isPending && change.variables?.op === "add"} disabled={!body.trim()}>
            Add note
          </SubmitButton>
        </div>
      </form>
      {job.notes.length > 0 && (
        <ul className="divide-y border-t">
          {job.notes.map((n) => (
            <li key={n.id} className="space-y-1.5 py-3">
              {editing?.id === n.id ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    change.mutate({ op: "edit", noteId: n.id, body: editing.body }, { onSuccess: () => setEditing(null) })
                  }}
                >
                  <Textarea aria-label="Edit note" value={editing.body} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} maxLength={20000} />
                  {errors.body && <p className="text-xs text-destructive">{errors.body}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <SubmitButton size="sm" pending={change.isPending}>
                      Save
                    </SubmitButton>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span>
                      {formatDate(n.createdAt, dateTime)}
                      {n.updatedAt !== n.createdAt && " · edited"}
                    </span>
                    <Button size="xs" variant="ghost" onClick={() => setEditing({ id: n.id, body: n.body })}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => change.mutate({ op: "delete", noteId: n.id }, { onError: (e) => toast.error(errorMessage(e) ?? "Couldn't delete.") })}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Interviews({ job }: { job: Detail }) {
  const change = useInterviewChange(job.id)
  const [form, setForm] = useState<{ id: string | null } | null>(null)
  const [now] = useState(Date.now)
  return (
    <Card className="gap-4 p-4 shadow-xs sm:p-6">
      <SectionTitle
        icon={Video}
        action={
          !form && (
            <Button size="sm" variant="ghost" onClick={() => setForm({ id: null })}>
              <Plus data-icon="inline-start" /> Add round
            </Button>
          )
        }
      >
        Interviews
      </SectionTitle>
      {form && (
        <InterviewForm
          key={form.id ?? "new"}
          initial={job.interviews.find((i) => i.id === form.id)}
          onCancel={() => setForm(null)}
          pending={change.isPending}
          error={change.error}
          onSubmit={(input) =>
            change.mutate(form.id ? { op: "edit", interviewId: form.id, input } : { op: "add", input }, {
              onSuccess: () => setForm(null),
            })
          }
        />
      )}
      {job.interviews.length === 0 && !form ? (
        <p className="text-sm text-muted-foreground">No interviews yet. Add each round as it&apos;s scheduled.</p>
      ) : (
        <ul className="divide-y">
          {job.interviews.map((i) => {
            const upcoming = i.scheduledAt && Date.parse(i.scheduledAt) > now
            const meeting = safeHref(i.meetingUrl)
            const otherZone = i.timezone && i.timezone !== browserTimeZone()
            return (
              <li key={i.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{i.round}</p>
                  <div className="flex items-center gap-1">
                    {upcoming && <Badge className="text-[10px]">Upcoming</Badge>}
                    <Button size="xs" variant="ghost" onClick={() => setForm({ id: i.id })}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => change.mutate({ op: "delete", interviewId: i.id }, { onError: (e) => toast.error(errorMessage(e) ?? "Couldn't delete.") })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {i.scheduledAt ? (
                    <>
                      {formatDate(i.scheduledAt, { dateStyle: "full", timeStyle: "short" })} your time
                      {otherZone && ` · ${formatDate(i.scheduledAt, { timeStyle: "short", timeZone: i.timezone })} ${i.timezone}`}
                    </>
                  ) : (
                    "Not scheduled yet"
                  )}
                </p>
                {meeting && (
                  <a href={meeting} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="size-3" /> Meeting link
                  </a>
                )}
                {i.notes && <p className="text-sm whitespace-pre-wrap">{i.notes}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function InterviewForm({
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  initial?: Interview
  onSubmit: (input: InterviewInput) => void
  onCancel: () => void
  pending: boolean
  error: unknown
}) {
  const [tz, setTz] = useState(initial?.timezone || browserTimeZone())
  const [round, setRound] = useState(initial?.round ?? "")
  const [when, setWhen] = useState(initial?.scheduledAt ? isoToZoned(initial.scheduledAt, tz) : "")
  const [meetingUrl, setMeetingUrl] = useState(initial?.meetingUrl ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const errors = fieldErrors(error)
  const zones = timeZones()
  return (
    <form
      className="space-y-3 rounded-xl border bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ round, scheduledAt: when ? zonedToIso(when, tz) : null, timezone: tz, meetingUrl, notes })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField id="iv-round" label="Round" placeholder="e.g. Recruiter screen" value={round} onChange={(e) => setRound(e.target.value)} maxLength={200} error={errors.round} required />
        <TextField id="iv-when" type="datetime-local" label="Date and time" value={when} onChange={(e) => setWhen(e.target.value)} error={errors.scheduledAt} />
        <Field data-invalid={errors.timezone ? true : undefined}>
          <FieldLabel htmlFor="iv-tz">Time zone</FieldLabel>
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger id="iv-tz" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.timezone && <FieldError>{errors.timezone}</FieldError>}
        </Field>
        <TextField id="iv-url" type="url" label="Meeting link" placeholder="https://" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} error={errors.meetingUrl} />
      </div>
      <Field>
        <FieldLabel htmlFor="iv-notes">Notes</FieldLabel>
        <Textarea id="iv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interviewers, topics, how it went…" maxLength={20000} />
      </Field>
      <FormAlert message={errorMessage(error)} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton size="sm" pending={pending}>
          {initial ? "Save round" : "Add round"}
        </SubmitButton>
      </div>
    </form>
  )
}
