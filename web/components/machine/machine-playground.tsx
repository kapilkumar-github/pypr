"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, CircleHelp, Flag, Lock, LoaderCircle, Play, RotateCcw, Send, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { CodeEditor } from "@/components/code/editor"
import { Markdown } from "@/components/code/markdown"
import { FormAlert } from "@/components/common/form-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import {
  useFinishSession,
  useHints,
  useLastReview,
  useMachineJudge,
  useMachineSolution,
  useRequestReview,
  useSession,
  type Judged,
  type SessionView,
  type Verdict,
} from "@/lib/api/machine"
import { cn } from "@/lib/utils"

const VERDICT: Record<Verdict, string> = { accepted: "Passed", wrong_answer: "Failed", runtime_error: "Runtime error", time_limit: "Time limit exceeded" }
const MODE_NAME = { practice: "Practice", interview: "Interview", review: "Review" } as const
const draftKey = (id: string) => `pypr:machine:${id}`

function readDraft(id: string): string | null {
  try {
    return localStorage.getItem(draftKey(id))
  } catch {
    return null
  }
}

export function MachinePlayground({ workspaceId, sessionId }: { workspaceId: string; sessionId: string }) {
  const session = useSession(workspaceId, sessionId)
  if (session.isPending) return <Skeleton className="m-6 h-[80svh] rounded-xl" aria-label="Loading session" />
  if (session.isError) return <div className="mx-auto max-w-xl p-6"><FormAlert message={errorMessage(session.error) ?? "Couldn't load this session."} /></div>
  return <Workbench workspaceId={workspaceId} sessionId={sessionId} view={session.data} />
}

function useCountdown(endsAt: string | null, serverNow: string, onZero: () => void) {
  // The browser clock may be wrong, so measure the offset to the server clock once.
  const offset = useRef(0)
  const [left, setLeft] = useState<number | null>(null)
  const zero = useRef(onZero)
  useEffect(() => {
    zero.current = onZero
  })
  useEffect(() => {
    offset.current = Date.parse(serverNow) - Date.now()
  }, [serverNow])
  useEffect(() => {
    if (!endsAt) return
    let fired = false
    const tick = () => {
      const ms = Date.parse(endsAt) - (Date.now() + offset.current)
      setLeft(Math.max(0, ms))
      if (ms <= 0 && !fired) {
        fired = true
        zero.current()
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [endsAt])
  return left
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

type Tab = "problem" | "solution" | "review"
type Out = "tests" | "console"

function Workbench({ workspaceId, sessionId, view }: { workspaceId: string; sessionId: string; view: SessionView }) {
  const { session, problem } = view
  const verified = useVerified()
  const judge = useMachineJudge(workspaceId, sessionId)
  const finish = useFinishSession(workspaceId, sessionId)
  const session$ = useSession(workspaceId, sessionId)
  const unlocked = problem.stages.filter((s) => !s.locked).length
  const over = session.finishedAt !== null && session.mode !== "review"

  const [source, setSource] = useState(() => readDraft(sessionId) ?? view.source)
  const sourceRef = useRef(source)
  const [resetKey, setResetKey] = useState(0)
  const [file, setFile] = useState("index.js")
  const [tab, setTab] = useState<Tab>("problem")
  const [out, setOut] = useState<Out>("tests")
  const [result, setResult] = useState<(Judged & { full: boolean }) | null>(null)
  const [running, setRunning] = useState<"run" | "submit" | null>(null)
  useEffect(() => {
    sourceRef.current = source
    try {
      localStorage.setItem(draftKey(sessionId), source)
    } catch {
      /* private mode: the draft just isn't kept */
    }
  }, [source, sessionId])

  const left = useCountdown(session.endsAt, session.now, () => void session$.refetch())

  const execute = async (full: boolean) => {
    if (running || over) return
    if (!verified) return verifyFirst()
    setRunning(full ? "submit" : "run")
    setOut("tests")
    try {
      const r = await judge.mutateAsync({ stage: unlocked, source: sourceRef.current, submit: full })
      setResult({ ...r, full })
      if (full) {
        if (r.cleared) {
          toast.success(r.stage === problem.stages.length ? "Every stage cleared." : `Stage ${r.stage} cleared. Stage ${r.stage + 1} is unlocked.`)
          if (r.stage < problem.stages.length) setTab("problem")
        } else toast.message(`${r.passed} of ${r.total} tests passed.`)
      }
    } catch (err) {
      toast.error(errorMessage(err) ?? "Couldn't run your code.")
    } finally {
      setRunning(null)
    }
  }

  const reset = () => {
    if (!confirm("Reset your code to the starting point?")) return
    setSource(problem.starter)
    setResetKey((k) => k + 1)
  }
  const endNow = () => {
    if (!confirm("End the interview now? You can't submit after this.")) return
    finish.mutate(undefined, { onError: (e) => toast.error(errorMessage(e) ?? "Couldn't end the session.") })
  }
  const tabs: Tab[] = ["problem", "solution", "review"]

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2 shrink-0 text-muted-foreground">
            <Link href={`/workspaces/${workspaceId}/machine-coding`}>
              <ArrowLeft data-icon="inline-start" /> Machine coding
            </Link>
          </Button>
          <h1 className="truncate font-semibold">{problem.title}</h1>
          <Badge variant="secondary" className="shrink-0">{MODE_NAME[session.mode]}</Badge>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">Stage {Math.min(unlocked, problem.stages.length)} of {problem.stages.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {session.endsAt && !over && left !== null && (
            <span className={cn("font-mono text-sm font-semibold tabular-nums", left < 5 * 60_000 ? "text-destructive" : "text-foreground")} aria-label="Time left">{clock(left)}</span>
          )}
          {over && <Badge variant="outline">{session.mode === "interview" ? "Time is up or finished" : "Finished"}</Badge>}
          <Button variant="ghost" size="sm" onClick={reset} disabled={over}>
            <RotateCcw data-icon="inline-start" /> Reset
          </Button>
          <Button variant="outline" size="sm" disabled={running !== null || over} onClick={() => void execute(false)} title="Run the example tests (Ctrl/Cmd + Enter)">
            {running === "run" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />} Run
          </Button>
          <Button size="sm" disabled={running !== null || over} onClick={() => void execute(true)}>
            {running === "submit" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />} Submit
          </Button>
          {session.mode === "interview" && !over && (
            <Button variant="ghost" size="sm" onClick={endNow} title="End the interview">
              <Flag data-icon="inline-start" /> End
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-px bg-border lg:grid-cols-2">
        <section className="flex min-h-0 flex-col bg-card" aria-label="Problem">
          <div className="flex gap-1 border-b px-3 pt-2" role="tablist">
            {tabs.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("border-b-2 px-3 py-1.5 text-sm font-medium capitalize", tab === t ? "border-primary" : "border-transparent text-muted-foreground")}>
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "problem" && <ProblemPane workspaceId={workspaceId} sessionId={sessionId} view={view} unlocked={unlocked} over={over} />}
            {tab === "solution" && <SolutionPane workspaceId={workspaceId} sessionId={sessionId} view={view} />}
            {tab === "review" && <ReviewPane workspaceId={workspaceId} sessionId={sessionId} view={view} />}
          </div>
        </section>

        <div className="grid min-h-0 grid-rows-[3fr_2fr] gap-px bg-border">
          <section className="flex min-h-0 flex-col bg-card" aria-label="Code">
            <div className="flex gap-1 border-b px-3 pt-2" role="tablist">
              {["index.js", ...(problem.prelude ? ["fake-redis.js"] : [])].map((n) => (
                <button key={n} role="tab" aria-selected={file === n} onClick={() => setFile(n)} className={cn("flex items-center gap-1 border-b-2 px-3 py-1.5 font-mono text-xs", file === n ? "border-primary" : "border-transparent text-muted-foreground")}>
                  {n !== "index.js" && <Lock className="size-3" aria-label="Read only" />}
                  {n}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {file === "index.js" ? (
                <CodeEditor key={resetKey} file="index.js" value={source} onChange={setSource} onRun={() => void execute(false)} />
              ) : (
                <pre className="h-full overflow-auto bg-[#1e1e1e] p-3 font-mono text-[13px] leading-relaxed text-[#d4d4d4]">{problem.prelude}</pre>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-card" aria-label="Output">
            <div className="flex items-center gap-1 border-b px-3 pt-2" role="tablist">
              {(["tests", "console"] as Out[]).map((t) => (
                <button key={t} role="tab" aria-selected={out === t} onClick={() => setOut(t)} className={cn("border-b-2 px-3 py-1.5 text-sm font-medium capitalize", out === t ? "border-primary" : "border-transparent text-muted-foreground")}>
                  {t}
                </button>
              ))}
              {result && (
                <span className={cn("ml-auto pb-1 text-xs font-medium", result.passed === result.total ? "text-success" : "text-muted-foreground")}>
                  {result.passed}/{result.total} passed{!result.full && " (examples)"}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
              <Output result={result} tab={out} running={running !== null} unlocked={unlocked} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Output({ result, tab, running, unlocked }: { result: (Judged & { full: boolean }) | null; tab: Out; running: boolean; unlocked: number }) {
  if (!result) {
    return <p className="text-muted-foreground">{running ? "Running on the server…" : `Run checks the example tests of ${unlocked === 1 ? "stage 1" : `stages 1 to ${unlocked}`}. Submit runs every test, hidden ones included, and a stage is cleared only when all of them pass.`}</p>
  }
  if (tab === "console") {
    return result.fatal || result.console ? (
      <pre className="space-y-0.5 whitespace-pre-wrap font-mono text-xs">
        {result.fatal && <div className="text-destructive">{result.fatal}</div>}
        {result.console}
      </pre>
    ) : (
      <p className="text-muted-foreground">Nothing printed. Use console.log to see values here.</p>
    )
  }
  let hidden = 0
  const stages = [...new Set(result.tests.map((t) => t.stage))]
  return (
    <div className="space-y-3">
      {result.fatal && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-2 font-mono text-xs text-destructive">{result.fatal}</pre>}
      {stages.map((n) => (
        <div key={n}>
          <p className="mb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Stage {n}</p>
          <ul className="space-y-1.5">
            {result.tests.filter((t) => t.stage === n).map((t, i) => {
              const ok = t.verdict === "accepted"
              return (
                <li key={i} className="flex items-start gap-2">
                  {ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t.hidden ? `Hidden test ${++hidden}` : t.name}</span>
                    {!ok && <span className="ml-2 text-xs text-muted-foreground">{VERDICT[t.verdict]}</span>}
                    {!ok && t.error && !result.fatal && <span className="block break-words font-mono text-xs text-muted-foreground">{t.error}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ProblemPane({ workspaceId, sessionId, view, unlocked, over }: { workspaceId: string; sessionId: string; view: SessionView; unlocked: number; over: boolean }) {
  const { problem, session } = view
  return (
    <div className="space-y-5">
      <Markdown source={problem.statement} />
      <div className="space-y-4">
        {problem.stages.map((s) => (
          <div key={s.n} className={cn("rounded-lg border p-3", s.locked && "bg-muted/40")}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {s.locked ? <Lock className="size-3.5 text-muted-foreground" /> : s.n < unlocked || session.stageReached >= s.n ? <Check className="size-3.5 text-success" /> : <span className="size-2 rounded-full bg-primary" />}
              Stage {s.n}: {s.title}
              {s.locked && <span className="text-xs font-normal text-muted-foreground">Clear stage {s.n - 1} to unlock</span>}
            </p>
            {!s.locked && (
              <div className="mt-2 space-y-2">
                {s.requirements && <Markdown source={s.requirements} />}
                <p className="text-xs text-muted-foreground">
                  {s.tests.length} example test{s.tests.length === 1 ? "" : "s"}
                  {s.hiddenCount > 0 && ` and ${s.hiddenCount} hidden`}
                  {s.tests.length > 0 && `: ${s.tests.map((t) => t.name).join("; ")}`}
                </p>
                {view.hints && s.hintCount > 0 && <Hints workspaceId={workspaceId} sessionId={sessionId} stage={s.n} />}
              </div>
            )}
          </div>
        ))}
      </div>
      {over && problem.followups.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold">Follow-up requirements</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{problem.followups.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
      {session.mode === "review" && problem.followups.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold">Follow-up requirements</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{problem.followups.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function Hints({ workspaceId, sessionId, stage }: { workspaceId: string; sessionId: string; stage: number }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(1)
  const hints = useHints(workspaceId, sessionId, stage, open)
  return (
    <div>
      <Button variant="outline" size="xs" onClick={() => setOpen((v) => !v)}>
        <CircleHelp data-icon="inline-start" /> {open ? "Hide hints" : "Show a hint"}
      </Button>
      {open && (
        <div className="mt-2 space-y-2">
          {hints.isPending && <Skeleton className="h-8" />}
          {hints.isError && <FormAlert message={errorMessage(hints.error) ?? "Couldn't load hints."} />}
          {hints.data?.hints.slice(0, shown).map((h, i) => <p key={i} className="rounded-lg bg-muted p-2 text-sm">{h}</p>)}
          {hints.data && shown < hints.data.hints.length && (
            <Button variant="ghost" size="xs" onClick={() => setShown((n) => n + 1)}>Another hint</Button>
          )}
        </div>
      )}
    </div>
  )
}

function SolutionPane({ workspaceId, sessionId, view }: { workspaceId: string; sessionId: string; view: SessionView }) {
  const [stage, setStage] = useState(1)
  const [asked, setAsked] = useState(false)
  const solution = useMachineSolution(workspaceId, sessionId, stage, asked)
  const stages = view.problem.stages
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {view.session.mode === "practice" ? "A stage's solution unlocks after you submit that stage." : view.session.mode === "interview" ? "Solutions open when the interview is over." : "Reference solutions, one per stage."}
      </p>
      <div className="flex flex-wrap gap-1">
        {stages.map((s) => (
          <Button key={s.n} size="xs" variant={stage === s.n ? "default" : "outline"} onClick={() => { setStage(s.n); setAsked(true) }}>
            Stage {s.n}
          </Button>
        ))}
      </div>
      {asked && (solution.isPending ? <Skeleton className="h-40" /> : solution.isError ? <FormAlert message={errorMessage(solution.error) ?? "Couldn't load the solution."} /> : (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">One possible solution through stage {stage}. Yours doesn&apos;t have to match.</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{solution.data.source}</pre>
        </div>
      ))}
    </div>
  )
}

function ReviewPane({ workspaceId, sessionId, view }: { workspaceId: string; sessionId: string; view: SessionView }) {
  const last = useLastReview(workspaceId, sessionId)
  const request = useRequestReview(workspaceId, sessionId)
  const review = request.data ?? last.data
  const locked = view.session.mode === "interview" && view.session.finishedAt === null
  const criteria = useMemo(() => view.problem.evaluation, [view.problem.evaluation])
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {locked ? "Reviews open when the interview is over." : "An AI interviewer scores your latest submitted code on these criteria and lists what to improve. Submit first so there is code to review."}
      </p>
      {!review && criteria.length > 0 && (
        <ul className="space-y-1 text-sm">{criteria.map((c) => <li key={c.name}><span className="font-medium">{c.name}</span> <span className="text-muted-foreground">{c.description}</span></li>)}</ul>
      )}
      <Button size="sm" disabled={locked || request.isPending} onClick={() => request.mutate(undefined, { onError: (e) => toast.error(errorMessage(e) ?? "The review didn't work.") })}>
        {request.isPending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />} {review ? "Review again" : "Review my code"}
      </Button>
      {review && (
        <div className="space-y-4">
          {review.summary && <p className="rounded-lg bg-muted p-3 text-sm">{review.summary}</p>}
          <ul className="space-y-2">
            {review.scores.map((s) => (
              <li key={s.criterion} className="rounded-lg border p-3">
                <p className="flex items-center justify-between text-sm font-semibold">
                  {s.criterion}
                  <span className={cn("font-mono", s.score >= 4 ? "text-success" : s.score <= 2 ? "text-destructive" : "text-warning")}>{s.score}/5</span>
                </p>
                <p className="text-sm text-muted-foreground">{s.comment}</p>
              </li>
            ))}
          </ul>
          {review.improvements.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold">Improve next</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">{review.improvements.map((x, i) => <li key={i}><Markdown source={x} /></li>)}</ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
