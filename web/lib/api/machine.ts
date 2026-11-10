"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "./client"

export type MachineCategory = "utility" | "backend" | "app"
export type MachineMode = "practice" | "interview" | "review"
export type Difficulty = "easy" | "medium" | "hard"

export type MachineSummary = {
  id: string
  slug: string
  category: MachineCategory
  title: string
  difficulty: Difficulty
  summary: string
  stages: number
  stagesCleared: number
  minutes: number
}

export type MachineSession = {
  id: string
  workspaceId: string
  problemId: string
  mode: MachineMode
  startedAt: string
  endsAt: string | null
  stageReached: number
  finishedAt: string | null
  /** Server clock when this was sent, for the countdown. */
  now: string
}

export type StageView = {
  n: number
  title: string
  locked: boolean
  requirements?: string
  tests: { name: string }[]
  hiddenCount: number
  hintCount: number
}

export type Criterion = { name: string; description: string }

export type MachineProblem = {
  id: string
  slug: string
  category: MachineCategory
  title: string
  difficulty: Difficulty
  statement: string
  requirements: string[]
  stages: StageView[]
  evaluation: Criterion[]
  followups: string[]
  prelude: string
  starter: string
  minutes: number
}

export type SessionView = { session: MachineSession; problem: MachineProblem; source: string; hints: boolean }

export type Verdict = "accepted" | "wrong_answer" | "runtime_error" | "time_limit"
export type StageTest = { stage: number; name: string; hidden: boolean; verdict: Verdict; timeMs: number; error?: string }
export type Judged = { tests: StageTest[]; passed: number; total: number; fatal?: string; console?: string; stage: number; cleared: boolean; stageReached: number }

export type Review = { scores: { criterion: string; score: number; comment: string }[]; summary: string; improvements: string[] }

const base = (w: string) => `/workspaces/${encodeURIComponent(w)}/machine`
const sbase = (w: string, s: string) => `${base(w)}/sessions/${encodeURIComponent(s)}`
const keys = {
  list: (w: string, c: string) => ["machine", w, "list", c] as const,
  session: (w: string, s: string) => ["machine", w, "session", s] as const,
}

export const machineUrl = (workspaceId: string, sessionId: string) => `/machine/${encodeURIComponent(workspaceId)}/${encodeURIComponent(sessionId)}`

export function useMachineProblems(workspaceId: string, category: MachineCategory | "") {
  return useQuery({
    queryKey: keys.list(workspaceId, category),
    queryFn: () => api<MachineSummary[]>(`${base(workspaceId)}/problems${category ? `?category=${category}` : ""}`),
  })
}

export function useStartSession(workspaceId: string) {
  return useMutation({
    mutationFn: (v: { problemId: string; mode: MachineMode; minutes?: number }) =>
      api<MachineSession>(`${base(workspaceId)}/problems/${encodeURIComponent(v.problemId)}/sessions`, "POST", { mode: v.mode, minutes: v.minutes }),
  })
}

export function useSession(workspaceId: string, sessionId: string) {
  return useQuery({ queryKey: keys.session(workspaceId, sessionId), queryFn: () => api<SessionView>(sbase(workspaceId, sessionId)), staleTime: Infinity, refetchOnWindowFocus: false })
}

/** Run checks the visible tests of stages 1..stage; Submit checks them all and records the attempt. */
export function useMachineJudge(workspaceId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { stage: number; source: string; submit: boolean }) => api<Judged>(`${sbase(workspaceId, sessionId)}/judge`, "POST", v),
    onSuccess: (r, v) => {
      if (!v.submit) return
      qc.invalidateQueries({ queryKey: keys.session(workspaceId, sessionId) })
      qc.invalidateQueries({ queryKey: ["machine", workspaceId, "list"] })
    },
  })
}

export function useFinishSession(workspaceId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>(`${sbase(workspaceId, sessionId)}/finish`, "POST", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.session(workspaceId, sessionId) }),
  })
}

export function useHints(workspaceId: string, sessionId: string, stage: number, enabled: boolean) {
  return useQuery({ queryKey: ["machine", workspaceId, "hints", sessionId, stage], queryFn: () => api<{ hints: string[] }>(`${sbase(workspaceId, sessionId)}/hints?stage=${stage}`), enabled })
}

export function useMachineSolution(workspaceId: string, sessionId: string, stage: number, enabled: boolean) {
  return useQuery({ queryKey: ["machine", workspaceId, "solution", sessionId, stage], queryFn: () => api<{ source: string }>(`${sbase(workspaceId, sessionId)}/solution?stage=${stage}`), enabled, retry: false })
}

export function useLastReview(workspaceId: string, sessionId: string) {
  return useQuery({ queryKey: ["machine", workspaceId, "review", sessionId], queryFn: () => api<Review | null>(`${sbase(workspaceId, sessionId)}/review`) })
}

export function useRequestReview(workspaceId: string, sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<Review>(`${sbase(workspaceId, sessionId)}/review`, "POST", {}),
    onSuccess: (r) => qc.setQueryData(["machine", workspaceId, "review", sessionId], r),
  })
}
