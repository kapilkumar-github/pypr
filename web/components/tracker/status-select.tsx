"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/api/client"
import { useSetStatus, type JobStatus, type TrackedJob } from "@/lib/api/tracker"
import { STATUSES } from "@/lib/tracker/meta"
import { ApplyDialog } from "./apply-dialog"

/**
 * Moves a job to any status. The first move to Applied opens the confirmation instead, because
 * applying happens on the employer's site and needs the user's word plus the resume used.
 */
export function StatusSelect({ job, size = "sm", className }: { job: TrackedJob; size?: "sm" | "default"; className?: string }) {
  const setStatus = useSetStatus()
  const [applying, setApplying] = useState(false)

  const change = (status: JobStatus) => {
    if (status === job.status) return
    if (status === "applied" && !job.appliedAt) {
      setApplying(true)
      return
    }
    setStatus.mutate(
      { id: job.id, status },
      { onError: (e) => toast.error(errorMessage(e) ?? "Couldn't change the status.") },
    )
  }

  return (
    <>
      <Select value={job.status} onValueChange={(v) => change(v as JobStatus)} disabled={setStatus.isPending}>
        <SelectTrigger size={size} className={className} aria-label={`Status of ${job.title} at ${job.company}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {applying && <ApplyDialog job={job} open onOpenChange={setApplying} />}
    </>
  )
}
