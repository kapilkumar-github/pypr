"use client"

import { cn } from "@/lib/utils"

/** Pill-style single choice (radio group) in a muted track. */
export function Segmented<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  icon?: React.ReactNode
  value: T
  options: readonly { id: T; name: string; icon?: React.ReactNode; disabled?: boolean; hint?: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5 text-muted-foreground", className)}
    >
      {icon && <span className="px-1.5 [&_svg]:size-3.5">{icon}</span>}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          title={o.hint}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5",
            value === o.id && "bg-card font-semibold text-foreground shadow-xs",
          )}
        >
          {o.icon}
          {o.name}
        </button>
      ))}
    </div>
  )
}
