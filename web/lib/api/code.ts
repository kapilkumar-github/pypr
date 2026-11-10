"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Files } from "@/lib/code/runner"
import { api } from "./client"

export type CodeKind = "machine_coding" | "dsa"
/** Run in the browser: javascript, html. Run on the server: nodejs, typescript (tests call your code), stdio (read stdin, print stdout). */
export type ProblemLanguage = "javascript" | "html" | "nodejs" | "typescript" | "stdio"
/** Languages a server problem can be solved in. */
export type ServerLanguage = "nodejs" | "typescript"
export type ProblemTest = { name: string; hidden: boolean; code?: string; input?: string; expected?: string }

export type ProblemSummary = {
  id: string
  kind: CodeKind
  language: ProblemLanguage
  title: string
  difficulty: "easy" | "medium" | "hard"
  solved: boolean
  attempted: boolean
}

export type Problem = ProblemSummary & {
  topic: string
  topicName: string
  statement: string
  hint: string
  starter: Files
  runner: "browser" | "server"
  /** Browser problems: every test. Server problems: only the visible ones, the rest are counted in hiddenCount. */
  tests: ProblemTest[]
  hiddenCount: number
  languages: ServerLanguage[] | null
  /** Your latest submitted files. Server problems with a free language key them by language. */
  last: Files | null
}

export type Verdict = "accepted" | "wrong_answer" | "runtime_error" | "time_limit"
export type JudgedTest = { name: string; hidden: boolean; verdict: Verdict; timeMs: number; input?: string; expected?: string; stdout?: string; error?: string }
export type Judged = { tests: JudgedTest[]; passed: number; total: number; fatal?: string; console?: string }

const base = (w: string) => `/workspaces/${encodeURIComponent(w)}/code/problems`
const keys = {
  list: (w: string, topic: string, kind: string) => ["code", w, "list", topic, kind] as const,
  one: (w: string, id: string) => ["code", w, "problem", id] as const,
  solution: (w: string, id: string) => ["code", w, "solution", id] as const,
}

export const codeUrl = (workspaceId: string, problemId: string) => `/code/${encodeURIComponent(workspaceId)}/${encodeURIComponent(problemId)}`

export function useCodeProblems(workspaceId: string, topic: string, kind: CodeKind, enabled: boolean) {
  return useQuery({
    queryKey: keys.list(workspaceId, topic, kind),
    queryFn: () => api<ProblemSummary[]>(`${base(workspaceId)}?topic=${encodeURIComponent(topic)}&kind=${kind}`),
    enabled,
  })
}

export function useCodeProblem(workspaceId: string, id: string) {
  return useQuery({
    queryKey: keys.one(workspaceId, id),
    queryFn: () => api<Problem>(`${base(workspaceId)}/${encodeURIComponent(id)}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export function useSubmitAttempt(workspaceId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { files: Files; passed: number; total: number }) => api<void>(`${base(workspaceId)}/${encodeURIComponent(id)}/attempts`, "POST", body),
    onSuccess: (_, v) => {
      qc.setQueryData<Problem>(keys.one(workspaceId, id), (p) => p && { ...p, attempted: true, solved: p.solved || v.passed === v.total })
      qc.invalidateQueries({ queryKey: ["code", workspaceId, "list"] })
      qc.invalidateQueries({ queryKey: keys.solution(workspaceId, id) })
    },
  })
}

export function useSolution(workspaceId: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.solution(workspaceId, id),
    queryFn: () => api<Files>(`${base(workspaceId)}/${encodeURIComponent(id)}/solution`),
    enabled,
    staleTime: Infinity,
  })
}

/** Runs code on the server. Run checks the visible tests; Submit checks all of them and records the attempt. */
export function useJudge(workspaceId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { language: ServerLanguage; source: string; submit: boolean }) => api<Judged>(`${base(workspaceId)}/${encodeURIComponent(id)}/judge`, "POST", body),
    onSuccess: (r, v) => {
      if (!v.submit) return
      qc.setQueryData<Problem>(keys.one(workspaceId, id), (p) => p && { ...p, attempted: true, solved: p.solved || r.passed === r.total })
      qc.invalidateQueries({ queryKey: ["code", workspaceId, "list"] })
      qc.invalidateQueries({ queryKey: keys.solution(workspaceId, id) })
    },
  })
}
