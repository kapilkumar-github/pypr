import { useQuery } from "@tanstack/react-query"

import { api } from "./client"

export type AdminStats = {
  totals: {
    users: number
    verifiedUsers: number
    resumes: number
    publicResumes: number
    downloads: number
    publicViews: number
  }
  daily: { date: string; signups: number; resumes: number; downloads: number }[]
  recentSignups: { name: string; email: string; verified: boolean; createdAt: string }[]
  updatedAt: string
}

/** The backend is the only thing that checks the code: a wrong one comes back as a 401. */
export function useAdminStats(code: string) {
  return useQuery({
    queryKey: ["admin-stats", code],
    queryFn: () => api<AdminStats>("/admin/stats", "GET", undefined, { "X-Admin-Code": code }),
    retry: false,
    refetchInterval: 60_000,
  })
}
