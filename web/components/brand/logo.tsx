import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * Brutalist wordmark: script "pypr" in a hard-edged box with an offset shadow that presses in on hover.
 * `collapsible` swaps to a single "p" when inside an icon-collapsed sidebar.
 */
export function Logo({
  href = "/",
  size = "default",
  collapsible = false,
  className,
}: {
  href?: string
  size?: "sm" | "default"
  collapsible?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label="pypr home"
      className={cn(
        "group/logo inline-flex shrink-0 items-center justify-center border-2 border-foreground bg-primary font-script leading-none text-primary-foreground transition-[translate,box-shadow] outline-none",
        "shadow-[3px_3px_0_0_var(--color-foreground)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_var(--color-foreground)]",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "sm" ? "h-7 px-2 pb-0.5 text-base" : "h-9 px-2.5 pb-1 text-xl",
        collapsible && "group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0",
        className,
      )}
    >
      <span className={cn(collapsible && "group-data-[collapsible=icon]:hidden")}>pypr</span>
      {collapsible && <span className="hidden group-data-[collapsible=icon]:inline">p</span>}
    </Link>
  )
}
