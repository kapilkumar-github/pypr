"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, runJob } from "./client"

export type Track = "ic" | "management" | "both"
export type Level = "unassessed" | "beginner" | "intermediate" | "advanced" | "ready"
export type ActivityKind = "concept" | "system_design" | "coding" | "mock_interview" | "behavioral" | "custom"
export type ProgressModel = "check" | "count" | "checklist"
export type Priority = "high" | "medium" | "low"
export type ActivityStatus = "todo" | "in_progress" | "done"
export type ModuleKey = "system_design" | "coding" | "mock_interviews" | "behavioral" | "leadership"

export type Skill = {
  key: string
  name: string
  area: string
  /** What the user says. Never treated as verified. */
  selfLevel: Level
  /** Shown by assessments or mock interviews (future modules). */
  demonstratedLevel: Exclude<Level, "unassessed"> | null
}

export type Workspace = {
  id: string
  name: string
  targetRole: string
  seniority: string
  track: Track
  yearsExperience: number | null
  technologies: string[]
  objectives: string
  jobDescription: string
  modules: ModuleKey[]
  resumes: { id: string; title: string }[]
  skills: Skill[]
  contextVersion: number
  createdAt: string
  updatedAt: string
}

export type WorkspaceSummary = {
  id: string
  name: string
  targetRole: string
  seniority: string
  technologies: string[]
  activitiesTotal: number
  activitiesDone: number
  updatedAt: string
}

export type WorkspaceInput = {
  name: string
  targetRole: string
  seniority: string
  track: Track
  yearsExperience: number | null
  technologies: string[]
  objectives: string
  jobDescription: string
  modules: ModuleKey[]
  resumeIds: string[]
  skills: { name: string; area: string }[]
}

export type ChecklistItem = { id: string; text: string; done: boolean }

export type Activity = {
  id: string
  kind: ActivityKind
  title: string
  description: string
  priority: Priority
  status: ActivityStatus
  progress: ProgressModel
  target: number | null
  completed: number
  checklist: ChecklistItem[]
  skillKey: string | null
  effortMinutes: number | null
  dueDate: string | null
  criteria: string
  position: number
  completions: { id: string; source: string; note: string; createdAt: string }[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ActivityInput = Pick<
  Activity,
  "kind" | "title" | "description" | "priority" | "status" | "progress" | "target" | "checklist" | "skillKey" | "effortMinutes" | "dueDate" | "criteria"
>

export const toInput = (a: Activity): ActivityInput => ({
  kind: a.kind,
  title: a.title,
  description: a.description,
  priority: a.priority,
  status: a.status,
  progress: a.progress,
  target: a.target,
  checklist: a.checklist,
  skillKey: a.skillKey,
  effortMinutes: a.effortMinutes,
  dueDate: a.dueDate,
  criteria: a.criteria,
})

export const workspaceToInput = (w: Workspace): WorkspaceInput => ({
  name: w.name,
  targetRole: w.targetRole,
  seniority: w.seniority,
  track: w.track,
  yearsExperience: w.yearsExperience,
  technologies: w.technologies,
  objectives: w.objectives,
  jobDescription: w.jobDescription,
  modules: w.modules,
  resumeIds: w.resumes.map((r) => r.id),
  skills: w.skills.map((s) => ({ name: s.name, area: s.area })),
})

const keys = {
  all: ["workspaces"] as const,
  detail: (id: string) => ["workspaces", id] as const,
  plan: (id: string) => ["workspaces", id, "activities"] as const,
  features: ["workspace-features"] as const,
}

const path = (id: string) => `/workspaces/${encodeURIComponent(id)}`

export function useWorkspaces() {
  return useQuery({ queryKey: keys.all, queryFn: () => api<WorkspaceSummary[]>("/workspaces") })
}

export function useWorkspace(id: string) {
  return useQuery({ queryKey: keys.detail(id), queryFn: () => api<Workspace>(path(id)) })
}

export function useWorkspaceFeatures() {
  return useQuery({
    queryKey: keys.features,
    queryFn: () => api<{ aiSuggestions: boolean }>("/workspace-features"),
    staleTime: Infinity,
  })
}

export function useCreateWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WorkspaceInput) => api<Workspace>("/workspaces", "POST", input),
    onSuccess: (w) => {
      qc.setQueryData(keys.detail(w.id), w)
      qc.invalidateQueries({ queryKey: keys.all, exact: true })
    },
  })
}

export function useUpdateWorkspace(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WorkspaceInput) => api<Workspace>(path(id), "PUT", input),
    onSuccess: (w) => {
      qc.setQueryData(keys.detail(id), w)
      qc.invalidateQueries({ queryKey: keys.all, exact: true })
    },
  })
}

export function useDeleteWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(path(id), "DELETE"),
    onSuccess: (_, id) => {
      qc.setQueryData<WorkspaceSummary[]>(keys.all, (list) => list?.filter((w) => w.id !== id))
      qc.removeQueries({ queryKey: keys.detail(id) })
    },
  })
}

export function useSetSkillLevel(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, selfLevel }: { key: string; selfLevel: Level }) =>
      api<Skill>(`/skills/${encodeURIComponent(key)}`, "PUT", { selfLevel }),
    onSuccess: (skill) => {
      qc.setQueryData<Workspace>(keys.detail(workspaceId), (w) =>
        w && { ...w, skills: w.skills.map((s) => (s.key === skill.key ? skill : s)) },
      )
      // Levels are shared, so other workspaces showing this skill are stale.
      qc.invalidateQueries({ queryKey: keys.all, predicate: (q) => q.queryKey[1] !== workspaceId })
    },
  })
}

export function usePlan(id: string) {
  return useQuery({ queryKey: keys.plan(id), queryFn: () => api<Activity[]>(`${path(id)}/activities`) })
}

/**
 * Every plan change replies with the whole plan. Changes to one workspace's plan run one at a
 * time (mutation scope), so a slow request can't apply over a newer one.
 */
export function usePlanChange<V>(id: string, request: (vars: V) => Promise<Activity[]>) {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: `plan-${id}` },
    mutationFn: request,
    onSuccess: (plan) => {
      qc.setQueryData(keys.plan(id), plan)
      qc.invalidateQueries({ queryKey: keys.all, exact: true })
    },
  })
}

export const planApi = (id: string) => ({
  add: (activities: ActivityInput[]) => api<Activity[]>(`${path(id)}/activities`, "POST", { activities }),
  update: ({ activityId, input }: { activityId: string; input: ActivityInput }) =>
    api<Activity[]>(`${path(id)}/activities/${encodeURIComponent(activityId)}`, "PUT", input),
  remove: (activityId: string) => api<Activity[]>(`${path(id)}/activities/${encodeURIComponent(activityId)}`, "DELETE"),
  reorder: (ids: string[]) => api<Activity[]>(`${path(id)}/activities/order`, "PUT", { ids }),
  complete: ({ activityId, note }: { activityId: string; note: string }) =>
    api<Activity[]>(`${path(id)}/activities/${encodeURIComponent(activityId)}/completions`, "POST", { note }),
  undo: ({ activityId, completionId }: { activityId: string; completionId: string }) =>
    api<Activity[]>(
      `${path(id)}/activities/${encodeURIComponent(activityId)}/completions/${encodeURIComponent(completionId)}`,
      "DELETE",
    ),
})

/** Rule-based suggestions (instant, no AI). Never saved until the user adds them. */
export const ruleSuggestions = async (id: string) =>
  (await api<{ activities: ActivityInput[] }>(`${path(id)}/suggestions`)).activities

/** AI suggestions on the API (20–60 s). */
export const aiSuggestions = async (id: string) =>
  (await runJob<{ activities: ActivityInput[] }>(`${path(id)}/plan-suggestions`, `${path(id)}/plan-suggestions`, {})).activities
