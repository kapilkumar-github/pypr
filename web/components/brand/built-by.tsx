import { cn } from "@/lib/utils"

const AUTHOR_URL = "https://www.linkedin.com/in/kapilkumar9395/"

/** "Built by Kapil Kumar" credit linking to the author's LinkedIn (opens a new tab). */
export function BuiltBy({ className }: { className?: string }) {
  return (
    <a
      href={AUTHOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "rounded-sm text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      Built by <span className="font-semibold text-foreground underline-offset-4 hover:underline">Kapil Kumar</span>
      <span className="sr-only"> (LinkedIn, opens in a new tab)</span>
    </a>
  )
}
