"use client"

import { AlarmClock, CalendarClock, CircleCheck } from "lucide-react"

import type { NextAction } from "@/lib/api/tracker"
import { dueState, formatDay } from "@/lib/tracker/meta"
import { cn } from "@/lib/utils"

/** In-app due indicator for a next action, against the user's local date. */
export function DueBadge({ action, className }: { action: NextAction; className?: string }) {
  const state = dueState(action)
  if (state === "none") return null
  const label =
    state === "done"
      ? "Done"
      : !action.due
        ? "No due date"
        : state === "overdue"
          ? `Overdue · ${formatDay(action.due)}`
          : state === "today"
            ? "Due today"
            : `Due ${formatDay(action.due)}`
  const tone =
    state === "overdue"
      ? "bg-destructive/10 text-destructive"
      : state === "today" || state === "soon"
        ? "bg-warning/10 text-warning"
        : state === "done"
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground"
  const Icon = state === "done" ? CircleCheck : state === "overdue" || state === "today" ? AlarmClock : CalendarClock
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tone, className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}
