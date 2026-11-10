"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "./client"

export type McqTopic = {
  key: string
  name: string
  area: string
  description: string
  selected: boolean
  questionCount: number
  unseenCount: number
  attempts: number
  bestPercent: number | null
  /** Coding problems for this topic by kind. */
  codeCounts: Partial<Record<"machine_coding" | "dsa", number>>
}

export type TestSummary = {
  id: string
  topic: string
  topicName: string
  questions: number
  durationSeconds: number
  startedAt: string
  deadline: string
  submittedAt: string | null
  score: number | null
}

export type TestQuestion = {
  position: number
  question: string
  options: string[]
  selected: number | null
  marked: boolean
  difficulty: "easy" | "medium" | "hard"
  /** Only after the test is finished. */
  answer?: number
  correct?: boolean
  explanation?: string
}

export type ChatTurn = { role: "user" | "assistant"; content: string }

export type Test = TestSummary & { finished: boolean; chatEnabled: boolean; serverTime: string; items: TestQuestion[] }

export type StartTestInput = { topic: string; questions: number; durationMinutes: number }

const base = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/mcq`
const keys = {
  topics: (w: string) => ["mcq", w, "topics"] as const,
  tests: (w: string) => ["mcq", w, "tests"] as const,
  test: (w: string, id: string) => ["mcq", w, "test", id] as const,
}

export function useMcqTopics(workspaceId: string) {
  return useQuery({ queryKey: keys.topics(workspaceId), queryFn: () => api<McqTopic[]>(`${base(workspaceId)}/topics`) })
}

export function useTests(workspaceId: string) {
  return useQuery({ queryKey: keys.tests(workspaceId), queryFn: () => api<TestSummary[]>(`${base(workspaceId)}/tests`) })
}

export function useTest(workspaceId: string, id: string) {
  return useQuery({
    queryKey: keys.test(workspaceId, id),
    queryFn: () => api<Test>(`${base(workspaceId)}/tests/${encodeURIComponent(id)}`),
    // Answers are saved as they are chosen and the deadline comes from the server, so the cache is the truth.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export function useStartTest(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StartTestInput) => api<Test>(`${base(workspaceId)}/tests`, "POST", input),
    onSuccess: (t) => {
      qc.setQueryData(keys.test(workspaceId, t.id), t)
      qc.invalidateQueries({ queryKey: keys.tests(workspaceId) })
      qc.invalidateQueries({ queryKey: keys.topics(workspaceId) })
    },
  })
}

export function useSaveAnswer(workspaceId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ position, selected }: { position: number; selected: number | null }) =>
      api<void>(`${base(workspaceId)}/tests/${encodeURIComponent(id)}/answers`, "PUT", { position, selected }),
    onMutate: ({ position, selected }) =>
      qc.setQueryData<Test>(keys.test(workspaceId, id), (t) => t && { ...t, items: t.items.map((q) => (q.position === position ? { ...q, selected } : q)) }),
  })
}

export function useSubmitTest(workspaceId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<Test>(`${base(workspaceId)}/tests/${encodeURIComponent(id)}/submit`, "POST", {}),
    onSuccess: (t) => {
      qc.setQueryData(keys.test(workspaceId, id), t)
      qc.invalidateQueries({ queryKey: keys.tests(workspaceId) })
      qc.invalidateQueries({ queryKey: keys.topics(workspaceId) })
    },
  })
}

/** Refetch a test whose time ran out in the background, to get its results. */
export function useRefreshTest(workspaceId: string, id: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.test(workspaceId, id) })
}

export function useMarkQuestion(workspaceId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ position, marked }: { position: number; marked: boolean }) =>
      api<void>(`${base(workspaceId)}/tests/${encodeURIComponent(id)}/marks`, "PUT", { position, marked }),
    onMutate: ({ position, marked }) =>
      qc.setQueryData<Test>(keys.test(workspaceId, id), (t) => t && { ...t, items: t.items.map((q) => (q.position === position ? { ...q, marked } : q)) }),
  })
}

/** Tells the server the test tab is closing. It submits the test shortly after unless the test is opened again. */
export function sendLeave(workspaceId: string, id: string) {
  void fetch(`/api${base(workspaceId)}/tests/${encodeURIComponent(id)}/leave`, {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {})
}

export const testUrl = (workspaceId: string, id: string) => `/take/${encodeURIComponent(workspaceId)}/${encodeURIComponent(id)}`

const chatKey = (w: string, id: string, position: number) => ["mcq", w, "chat", id, position] as const

export function useChat(workspaceId: string, id: string, position: number, enabled: boolean) {
  return useQuery({
    queryKey: chatKey(workspaceId, id, position),
    queryFn: () => api<ChatTurn[]>(`${base(workspaceId)}/tests/${encodeURIComponent(id)}/chat?position=${position}`),
    enabled,
  })
}

export function useSendChat(workspaceId: string, id: string, position: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => api<ChatTurn[]>(`${base(workspaceId)}/tests/${encodeURIComponent(id)}/chat`, "POST", { position, message }),
    onSuccess: (turns) => qc.setQueryData<ChatTurn[]>(chatKey(workspaceId, id, position), (old) => [...(old ?? []), ...turns]),
  })
}
