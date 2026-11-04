import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  )
}
