"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export function SectionCard({
  icon,
  title,
  count,
  defaultOpen = false,
  actions,
  children,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  defaultOpen?: boolean
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex items-center bg-muted/70 transition-colors hover:bg-muted">
        <CollapsibleTrigger className="flex flex-1 items-center gap-2.5 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="text-primary [&_svg]:size-4">{icon}</span>
          <span className="text-xs font-bold">{title}</span>
          {count !== undefined && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronDown
            className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </CollapsibleTrigger>
        {actions && <div className="pr-3">{actions}</div>}
      </div>
      <CollapsibleContent className="border-t p-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}
