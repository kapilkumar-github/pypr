"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Blocks, Clock, GraduationCap, LoaderCircle, MessagesSquare, Timer } from "lucide-react"
import { toast } from "sonner"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { useActiveWorkspace } from "@/components/workspace/workspace-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { errorMessage } from "@/lib/api/client"
import { machineUrl, useMachineProblems, useStartSession, type MachineCategory, type MachineMode, type MachineSummary } from "@/lib/api/machine"
import { cn } from "@/lib/utils"

const CATEGORIES: { id: MachineCategory | ""; name: string }[] = [
  { id: "", name: "All" },
  { id: "utility", name: "Utilities" },
  { id: "backend", name: "Backend components" },
  { id: "app", name: "Applications" },
]

const MODES: { id: MachineMode; name: string; description: string; icon: typeof Blocks }[] = [
  { id: "practice", name: "Practice", description: "No clock. Hints per stage, and each stage's solution unlocks after you submit it.", icon: GraduationCap },
  { id: "interview", name: "Interview", description: "Timed, no hints. Stages unlock one by one. The solution and a review open when time is up.", icon: Timer },
  { id: "review", name: "Review", description: "Your latest attempt is scored against the evaluation criteria, with concrete improvements. Needs an earlier attempt.", icon: MessagesSquare },
]

const DIFFICULTY: Record<string, string> = { easy: "text-success", medium: "text-warning", hard: "text-destructive" }

/** Machine coding: multi-stage problems, each opened as a practice, interview or review session. */
export function MachineList() {
  const w = useActiveWorkspace()
  const [category, setCategory] = useState<MachineCategory | "">("")
  const problems = useMachineProblems(w.id, category)
  const [picked, setPicked] = useState<MachineSummary | null>(null)
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Machine coding</h2>
        <p className="text-sm text-muted-foreground">Build real components in stages. Each stage adds requirements, like an interviewer asking &ldquo;now make it work across servers.&rdquo;</p>
      </div>
      <Tabs value={category} onValueChange={(v) => setCategory(v as MachineCategory | "")}>
        <TabsList>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.id || "all"} value={c.id}>
              {c.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {problems.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : problems.isError ? (
        <FormAlert message={errorMessage(problems.error) ?? "Couldn't load the problems."} />
      ) : problems.data.length === 0 ? (
        <EmptyState icon={Blocks} title="No problems yet" description="Machine coding problems are being prepared. Check back soon." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {problems.data.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setPicked(p)} className="flex h-full w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{p.title}</span>
                  <span className={cn("text-xs font-semibold capitalize", DIFFICULTY[p.difficulty])}>{p.difficulty}</span>
                </span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{p.summary}</span>
                <span className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Badge variant="secondary">{CATEGORIES.find((c) => c.id === p.category)?.name}</Badge>
                  <span>{p.stages} stages</span>
                  <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {p.minutes} min</span>
                  {p.stagesCleared > 0 && <span className={cn("ml-auto font-medium", p.stagesCleared === p.stages ? "text-success" : "text-primary")}>{p.stagesCleared}/{p.stages} cleared</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ModeDialog workspaceId={w.id} problem={picked} onClose={() => setPicked(null)} />
    </div>
  )
}

function ModeDialog({ workspaceId, problem, onClose }: { workspaceId: string; problem: MachineSummary | null; onClose: () => void }) {
  const router = useRouter()
  const verified = useVerified()
  const start = useStartSession(workspaceId)
  const [minutes, setMinutes] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<MachineMode | null>(null)

  const go = (mode: MachineMode) => {
    if (!problem) return
    if (!verified) return verifyFirst()
    const m = Number(minutes ?? problem.minutes)
    if (mode === "interview" && !(Number.isInteger(m) && m >= 15 && m <= 180)) return setError("Choose 15 to 180 minutes.")
    setError(null)
    setBusy(mode)
    start.mutate(
      { problemId: problem.id, mode, minutes: mode === "interview" ? m : undefined },
      {
        onSuccess: (s) => router.push(machineUrl(workspaceId, s.id)),
        onError: (e) => {
          setBusy(null)
          setError(errorMessage(e) ?? "Couldn't start.")
          toast.error(errorMessage(e) ?? "Couldn't start.")
        },
      },
    )
  }
  return (
    <Dialog open={problem !== null} onOpenChange={(o) => { if (!o) { setError(null); setBusy(null); setMinutes(null); onClose() } }}>
      <DialogContent className="sm:max-w-lg">
        {problem && (
          <>
            <DialogHeader>
              <DialogTitle>{problem.title}</DialogTitle>
              <DialogDescription>{problem.stages} stages · about {problem.minutes} minutes. Pick how you want to work.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {MODES.map((m) => (
                <div key={m.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <m.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-sm text-muted-foreground">{m.description}</p>
                      {m.id === "interview" && (
                        <label className="mt-2 flex items-center gap-2 text-sm">
                          Minutes
                          <Input type="number" inputMode="numeric" min={15} max={180} className="h-8 w-20" value={minutes ?? String(problem.minutes)} onChange={(e) => setMinutes(e.target.value)} />
                        </label>
                      )}
                    </div>
                    <Button size="sm" variant={m.id === "practice" ? "default" : "outline"} disabled={busy !== null} onClick={() => go(m.id)}>
                      {busy === m.id ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
                      {m.id === "interview" ? "Start" : "Open"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {error && <FormAlert message={error} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
