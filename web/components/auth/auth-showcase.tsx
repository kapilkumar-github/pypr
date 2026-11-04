import { CloudCheck, Eye, Star } from "lucide-react"

import { FloatingIcons } from "@/components/brand/floating-icons"
import { Logo } from "@/components/brand/logo"

function Bar({ className }: { className: string }) {
  return <div className={`h-2 rounded-full ${className}`} />
}

/** Left-hand brand panel of the auth split layout (desktop only). Decorative. */
export function AuthShowcase() {
  return (
    <aside className="relative isolate hidden flex-col justify-between overflow-hidden border-r bg-paper p-14 lg:flex lg:w-[48%]">
      <FloatingIcons />
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 -z-10 size-96 rounded-full bg-brand-from/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-10 bottom-10 -z-10 size-80 rounded-full bg-brand-to/15 blur-3xl" />

      <Logo className="self-start" />

      <div aria-hidden className="my-auto flex justify-center py-12">
        <div className="relative aspect-[4/3] w-full max-w-[420px]">
          <div className="absolute inset-x-8 inset-y-4 -rotate-3 rounded-2xl bg-card/80 p-5 shadow-xl backdrop-blur-sm transition-transform duration-500 hover:-rotate-1">
            <div className="flex flex-col gap-2.5 opacity-60">
              <Bar className="h-2.5 w-1/3 bg-primary/30" />
              <Bar className="h-1.5 w-full bg-border" />
              <Bar className="h-1.5 w-5/6 bg-border" />
              <Bar className="h-1.5 w-2/3 bg-border" />
            </div>
          </div>

          <div className="relative rounded-2xl bg-card p-7 shadow-2xl ring-1 ring-border transition-transform duration-300 hover:scale-[1.02]">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-linear-to-tr from-brand-from to-brand-to text-sm font-semibold text-primary-foreground">
                EK
              </div>
              <div className="space-y-1.5">
                <Bar className="h-3 w-28 bg-foreground" />
                <Bar className="w-20 bg-primary" />
              </div>
            </div>
            <div className="mb-6 space-y-3">
              <div className="space-y-1.5">
                <Bar className="w-full bg-muted" />
                <Bar className="w-11/12 bg-muted" />
                <Bar className="w-3/4 bg-muted" />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-accent p-3">
                <span className="flex items-center gap-2 text-xs font-semibold text-accent-foreground">
                  <span className="size-2 rounded-full bg-success" /> Led platform migration
                </span>
                <span className="text-xs font-bold text-success">+38% faster</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {["System Design", "TypeScript", "Go"].map((s) => (
                <span key={s} className="rounded-md bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="absolute -bottom-4 -left-3 flex items-center gap-2.5 rounded-xl bg-card px-4 py-2.5 shadow-lg ring-1 ring-border">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Eye className="size-4" />
            </span>
            <span>
              <span className="block text-[11px] font-bold">Live preview</span>
              <span className="block text-xs text-muted-foreground">See every edit instantly</span>
            </span>
          </div>
          <div className="absolute -top-3 -right-3 flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-md ring-1 ring-border">
            <CloudCheck className="size-4 text-success" />
            <span className="text-[11px] font-bold">Autosaved</span>
          </div>
          <Star className="absolute -right-6 bottom-10 size-5 fill-primary text-primary motion-safe:animate-bounce [animation-duration:3s]" />
        </div>
      </div>

      <div>
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Your career story, beautifully crafted.</h2>
        <p className="text-sm text-muted-foreground">
          Build a resume recruiters can scan in seconds, then prepare for the interview.
        </p>
      </div>
    </aside>
  )
}
