"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "./client"

export type BoardSummary = { id: string; title: string; promptKey: string | null; updatedAt: string }
/** The canvas document. React Flow owns the shape of nodes and edges; the API only checks it is JSON of a bounded size. */
export type BoardDoc = { nodes: unknown[]; edges: unknown[]; viewport?: { x: number; y: number; zoom: number }; checklist?: Record<string, boolean>; notes?: BoardNote[] }
/** A floating note on the canvas. Position and size are in screen pixels of the canvas area. */
export type BoardNote = { id: string; title: string; text: string; x: number; y: number; w: number; h: number; open: boolean }
export type Board = BoardSummary & { doc: BoardDoc }

const base = (w: string) => `/workspaces/${encodeURIComponent(w)}/design/boards`
const keys = { list: (w: string) => ["design", w, "list"] as const, one: (w: string, id: string) => ["design", w, "board", id] as const }

export const boardUrl = (workspaceId: string, boardId: string) => `/design/${encodeURIComponent(workspaceId)}/${encodeURIComponent(boardId)}`

export function useBoards(workspaceId: string) {
  return useQuery({ queryKey: keys.list(workspaceId), queryFn: () => api<BoardSummary[]>(base(workspaceId)) })
}

export function useBoard(workspaceId: string, id: string) {
  return useQuery({ queryKey: keys.one(workspaceId, id), queryFn: () => api<Board>(`${base(workspaceId)}/${encodeURIComponent(id)}`), staleTime: Infinity, refetchOnWindowFocus: false })
}

export function useCreateBoard(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { title: string; promptKey?: string; doc?: BoardDoc }) => api<BoardSummary>(base(workspaceId), "POST", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list(workspaceId) }),
  })
}

/** Autosave: the canvas calls this a moment after the last change. */
export function useSaveBoard(workspaceId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { title: string; doc: BoardDoc }) => api<{ updatedAt: string }>(`${base(workspaceId)}/${encodeURIComponent(id)}`, "PUT", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list(workspaceId) }),
  })
}

export function useDeleteBoard(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`${base(workspaceId)}/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list(workspaceId) }),
  })
}

export type EvalScore = { area: string; score: number; comment: string }
export type Evaluation = { summary: string; scores: EvalScore[]; covered: string[]; gaps: string[]; followups: string[] }
export type DiscussionMessage = { id: string; role: "user" | "assistant"; kind: "chat" | "explanation" | "evaluation"; content: string; result?: Evaluation; createdAt: string }

const messagesKey = (w: string, id: string) => ["design", w, "messages", id] as const

export function useMessages(workspaceId: string, boardId: string) {
  return useQuery({ queryKey: messagesKey(workspaceId, boardId), queryFn: () => api<DiscussionMessage[]>(`${base(workspaceId)}/${encodeURIComponent(boardId)}/messages`) })
}

function useAppend<V>(workspaceId: string, boardId: string, path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: V) => api<DiscussionMessage[]>(`${base(workspaceId)}/${encodeURIComponent(boardId)}/${path}`, "POST", v),
    onSuccess: (added) => qc.setQueryData<DiscussionMessage[]>(messagesKey(workspaceId, boardId), (old) => [...(old ?? []), ...added]),
  })
}

/** `requirement` is the question the learner sees; `reference` is what the interviewer knows and the learner does not. */
export type Ask = { requirement: string; reference: string }

export const useEvaluate = (workspaceId: string, boardId: string) => useAppend<Ask & { explanation: string }>(workspaceId, boardId, "evaluate")
export const useDesignChat = (workspaceId: string, boardId: string) => useAppend<Ask & { message: string }>(workspaceId, boardId, "chat")
