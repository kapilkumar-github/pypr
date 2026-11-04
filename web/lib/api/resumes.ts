"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { normalizeResume } from "@/lib/resume/defaults"
import type { ResumeData } from "@/lib/resume/types"
import { api } from "./client"

export type ResumeSummary = {
  id: string
  title: string
  jobTitle: string
  template: string
  data: ResumeData
  createdAt: string
  updatedAt: string
}

export type Resume = { id: string; title: string; data: ResumeData; createdAt: string; updatedAt: string }
type ResumeInput = { title: string; data: ResumeData }

const keys = {
  all: ["resumes"] as const,
  detail: (id: string) => ["resumes", id] as const,
}

const fromApi = (r: Omit<Resume, "data"> & { data: unknown }): Resume => ({ ...r, data: normalizeResume(r.data) })

export function useResumes() {
  return useQuery({
    queryKey: keys.all,
    queryFn: async () =>
      (await api<(Omit<ResumeSummary, "data"> & { data: unknown })[]>("/resumes")).map((r) => ({
        ...r,
        data: normalizeResume(r.data),
      })),
  })
}

export function useResume(id: string) {
  return useQuery({
    queryKey: keys.detail(id),
    queryFn: async () => fromApi(await api<Resume>(`/resumes/${encodeURIComponent(id)}`)),
  })
}

export function useCreateResume() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ResumeInput) => fromApi(await api<Resume>("/resumes", "POST", input)),
    onSuccess: (r) => {
      qc.setQueryData(keys.detail(r.id), r)
      qc.invalidateQueries({ queryKey: keys.all, exact: true })
    },
  })
}

/** Saves run one at a time per resume (mutation scope), so a slow save can never overwrite a newer one. */
export function useUpdateResume(id: string) {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: `resume-${id}` },
    mutationFn: async (input: ResumeInput) =>
      fromApi(await api<Resume>(`/resumes/${encodeURIComponent(id)}`, "PUT", input)),
    onSuccess: (r) => {
      qc.setQueryData(keys.detail(id), r)
      qc.invalidateQueries({ queryKey: keys.all, exact: true })
    },
  })
}

export function useDeleteResume() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/resumes/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: (_, id) => {
      qc.setQueryData<ResumeSummary[]>(keys.all, (list) => list?.filter((r) => r.id !== id))
      qc.removeQueries({ queryKey: keys.detail(id) })
    },
  })
}

export type ResumeVersion = { id: string; label: string; title: string; createdAt: string }

const versionKeys = (id: string) => ["resumes", id, "versions"] as const

export function useResumeVersions(id: string, enabled = true) {
  return useQuery({
    queryKey: versionKeys(id),
    queryFn: () => api<ResumeVersion[]>(`/resumes/${encodeURIComponent(id)}/versions`),
    enabled,
  })
}

export function useSaveVersion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api<ResumeVersion>(`/resumes/${encodeURIComponent(id)}/versions`, "POST", { label }),
    onSuccess: () => qc.invalidateQueries({ queryKey: versionKeys(id) }),
  })
}

/** Restores a version; the server saves the current state as "Before restoring" first. */
export function useRestoreVersion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: `resume-${id}` },
    mutationFn: async (versionId: string) =>
      fromApi(await api<Resume>(`/resumes/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, "POST")),
    onSuccess: (r) => {
      qc.setQueryData(keys.detail(id), r)
      qc.invalidateQueries({ queryKey: keys.all, exact: true })
      qc.invalidateQueries({ queryKey: versionKeys(id) })
    },
  })
}

export function useDeleteVersion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) =>
      api<void>(`/resumes/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: versionKeys(id) }),
  })
}

export type Sharing = {
  public: boolean
  slug: string
  hideContact: boolean
  allowDownload: boolean
  indexable: boolean
  views: number
  downloads: number
}
export type SharingInput = Omit<Sharing, "views" | "downloads">

const sharingKey = (id: string) => ["resumes", id, "sharing"] as const

export function useSharing(id: string, enabled = true) {
  return useQuery({
    queryKey: sharingKey(id),
    queryFn: () => api<Sharing>(`/resumes/${encodeURIComponent(id)}/sharing`),
    enabled,
  })
}

export function useUpdateSharing(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SharingInput) => api<Sharing>(`/resumes/${encodeURIComponent(id)}/sharing`, "PUT", input),
    onSuccess: (s) => qc.setQueryData(sharingKey(id), s),
  })
}
