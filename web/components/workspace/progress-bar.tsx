import { cn } from "@/lib/utils"

/** Thin bar for progress from 0 to 1. */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", pct === 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  )
}
