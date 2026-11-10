"use client"

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "./client"

export type JobStatus =
  | "saved"
  | "preparing"
  | "applied"
  | "interviewing"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "closed"
export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown"
export type JobSource =
  | "greenhouse"
  | "lever"
  | "workday"
  | "workable"
  | "ashby"
  | "smartrecruiters"
  | "linkedin"
  | "indeed"
  | "company_site"
  | "referral"
  | "other"
export type SalaryPeriod = "" | "year" | "month" | "week" | "day" | "hour"

export type NextAction = { text: string; due: string | null; doneAt: string | null }

export type TrackedJob = {
  id: string
  company: string
  title: string
  location: string
  workArrangement: WorkArrangement
  employmentType: string
  discoveryUrl: string
  applicationUrl: string
  portalUrl: string
  applicationRef: string
  source: JobSource | ""
  externalId: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  salaryPeriod: SalaryPeriod
  status: JobStatus
  appliedAt: string | null
  resumeId: string | null
  resumeTitle: string | null
  nextAction: NextAction
  createdAt: string
  updatedAt: string
}

export type StatusEvent = { id: string; from: JobStatus | null; to: JobStatus; createdAt: string }

export type ResumeSnapshot = {
  id: string
  kind: "pypr" | "external" | "none"
  /** Recorded when the user confirmed applying. Otherwise added afterwards. */
  atSubmission: boolean
  resumeId: string | null
  title: string
  label: string
  data?: unknown
  createdAt: string
}

export type JobNote = { id: string; body: string; createdAt: string; updatedAt: string }

export type Interview = {
  id: string
  round: string
  scheduledAt: string | null
  timezone: string
  meetingUrl: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type JobDetail = TrackedJob & {
  description: string
  history: StatusEvent[]
  resumes: ResumeSnapshot[]
  notes: JobNote[]
  interviews: Interview[]
}

export type JobInput = {
  company: string
  title: string
  location: string
  workArrangement: WorkArrangement
  employmentType: string
  discoveryUrl: string
  applicationUrl: string
  portalUrl: string
  applicationRef: string
  source: JobSource | ""
  externalId: string
  description: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  salaryPeriod: SalaryPeriod
  resumeId: string | null
  appliedAt?: string | null
  note?: string
  status?: "saved" | "preparing"
}

export type Extraction = {
  status: "ok" | "partial" | "failed"
  reason?: "blocked_url" | "requires_auth" | "not_found" | "unsupported" | "timeout" | "fetch_failed"
  message?: string
  fields: JobInput
}

export type Duplicate = {
  id: string
  company: string
  title: string
  location: string
  status: JobStatus
  source: string
  externalId: string
  reason: "url" | "external_id" | "company_title"
  createdAt: string
}

export type ResumeChoice = { kind: "pypr"; resumeId: string } | { kind: "external"; label: string } | { kind: "none" }

export type ListParams = {
  q: string
  status: JobStatus | ""
  source: JobSource | ""
  arrangement: WorkArrangement | ""
  sort: "updated" | "created" | "applied"
}

type Page = { items: TrackedJob[]; total: number; next: number | null }

const PAGE_SIZE = 100

const keys = {
  all: ["tracked-jobs"] as const,
  list: (p: ListParams) => ["tracked-jobs", "list", p] as const,
  detail: (id: string) => ["tracked-jobs", "detail", id] as const,
}

const path = (id: string, ...rest: string[]) =>
  ["/tracked-jobs", encodeURIComponent(id), ...rest.map(encodeURIComponent)].join("/")

export function useTrackedJobs(params: ListParams) {
  return useInfiniteQuery({
    queryKey: keys.list(params),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ sort: params.sort, limit: String(PAGE_SIZE), offset: String(pageParam) })
      if (params.q.trim()) qs.set("q", params.q.trim())
      if (params.status) qs.set("status", params.status)
      if (params.source) qs.set("source", params.source)
      if (params.arrangement) qs.set("arrangement", params.arrangement)
      return api<Page>(`/tracked-jobs?${qs}`)
    },
    getNextPageParam: (last) => last.next ?? undefined,
    placeholderData: keepPreviousData,
  })
}

export function useTrackedJob(id: string) {
  return useQuery({ queryKey: keys.detail(id), queryFn: () => api<JobDetail>(path(id)) })
}

/** Every change to a job replies with its full detail; lists are refetched. */
function useJobMutation<V>(request: (vars: V) => Promise<JobDetail>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (d) => {
      qc.setQueryData(keys.detail(d.id), d)
      qc.invalidateQueries({ queryKey: [...keys.all, "list"] })
    },
  })
}

export function useCreateJob() {
  return useJobMutation((input: JobInput) => api<JobDetail>("/tracked-jobs", "POST", input))
}

export function useUpdateJob(id: string) {
  return useJobMutation((input: JobInput) => api<JobDetail>(path(id), "PUT", input))
}

export function useSetStatus() {
  return useJobMutation(({ id, status }: { id: string; status: JobStatus }) =>
    api<JobDetail>(path(id, "status"), "PUT", { status }),
  )
}

export function useConfirmApply() {
  return useJobMutation(({ id, appliedAt, resume }: { id: string; appliedAt: string | null; resume: ResumeChoice }) =>
    api<JobDetail>(path(id, "apply"), "POST", { appliedAt, resume }),
  )
}

export function useAttachResume(id: string) {
  return useJobMutation((resume: ResumeChoice) => api<JobDetail>(path(id, "resumes"), "POST", resume))
}

export function useSnapshot(jobId: string, snapshotId: string | null) {
  return useQuery({
    queryKey: [...keys.detail(jobId), "resume", snapshotId],
    queryFn: () => api<ResumeSnapshot>(path(jobId, "resumes", snapshotId!)),
    enabled: !!snapshotId,
    staleTime: Infinity, // snapshots never change
  })
}

export function useSetNextAction(id: string) {
  return useJobMutation((input: { text: string; due: string | null; done: boolean }) =>
    api<JobDetail>(path(id, "next-action"), "PUT", input),
  )
}

export function useNoteChange(id: string) {
  return useJobMutation((change: { op: "add"; body: string } | { op: "edit"; noteId: string; body: string } | { op: "delete"; noteId: string }) => {
    switch (change.op) {
      case "add":
        return api<JobDetail>(path(id, "notes"), "POST", { body: change.body })
      case "edit":
        return api<JobDetail>(path(id, "notes", change.noteId), "PUT", { body: change.body })
      case "delete":
        return api<JobDetail>(path(id, "notes", change.noteId), "DELETE")
    }
  })
}

export type InterviewInput = { round: string; scheduledAt: string | null; timezone: string; meetingUrl: string; notes: string }

export function useInterviewChange(id: string) {
  return useJobMutation(
    (change: { op: "add"; input: InterviewInput } | { op: "edit"; interviewId: string; input: InterviewInput } | { op: "delete"; interviewId: string }) => {
      switch (change.op) {
        case "add":
          return api<JobDetail>(path(id, "interviews"), "POST", change.input)
        case "edit":
          return api<JobDetail>(path(id, "interviews", change.interviewId), "PUT", change.input)
        case "delete":
          return api<JobDetail>(path(id, "interviews", change.interviewId), "DELETE")
      }
    },
  )
}

export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(path(id), "DELETE"),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: keys.detail(id) })
      qc.invalidateQueries({ queryKey: [...keys.all, "list"] })
    },
  })
}

export function extractJob(url: string) {
  return api<Extraction>("/job-extractions", "POST", { url })
}

export async function findDuplicates(q: {
  excludeId?: string
  discoveryUrl: string
  applicationUrl: string
  source: string
  externalId: string
  company: string
  title: string
}) {
  return (await api<{ duplicates: Duplicate[] }>("/tracked-jobs/duplicates", "POST", q)).duplicates
}
