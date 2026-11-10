"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Clock, Flag, X } from "lucide-react"
import { toast } from "sonner"

import { FormAlert } from "@/components/common/form-alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import { sendLeave, useMarkQuestion, useSaveAnswer, useSubmitTest, useTest, type Test } from "@/lib/api/mcq"
import { cn } from "@/lib/utils"
import { ProgressBar } from "./progress-bar"
import { QuestionChat } from "./question-chat"

/** A test in progress, or its results once finished. The server owns the clock and the answers. */
export function TestRunner({ workspaceId, testId }: { workspaceId: string; testId: string }) {
  const test = useTest(workspaceId, testId)
  if (test.isPending) return <Skeleton className="m-6 h-96 rounded-xl" aria-label="Loading test" />
  if (test.isError) return <div className="mx-auto max-w-xl p-6"><FormAlert message={errorMessage(test.error) ?? "Couldn't load this test."} /></div>
  return test.data.finished ? <Results workspaceId={workspaceId} test={test.data} /> : <Taking workspaceId={workspaceId} test={test.data} />
}

const clock = (seconds: number) => {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s % 60).padStart(2, "0")}`
}

function Taking({ workspaceId, test }: { workspaceId: string; test: Test }) {
  const save = useSaveAnswer(workspaceId, test.id)
  const mark = useMarkQuestion(workspaceId, test.id)
  const submit = useSubmitTest(workspaceId, test.id)
  const router = useRouter()
  const toResults = () => router.replace(`/workspaces/${workspaceId}/practice?tab=results`)
  const [i, setI] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [visited, setVisited] = useState(() => new Set(test.items.filter((x) => x.selected !== null || x.marked).map((x) => x.position)))
  // Time left comes from the server's own clock (deadline minus its "now"), so a wrong device clock doesn't matter.
  const initial = (new Date(test.deadline).getTime() - new Date(test.serverTime).getTime()) / 1000
  const [mountedAt] = useState(() => Date.now())
  const [seconds, setSeconds] = useState(Math.ceil(initial))
  const submitted = useRef(false)
  const q = test.items[i]!
  const answered = test.items.filter((x) => x.selected !== null).length
  const marked = test.items.filter((x) => x.marked).length

  const finish = submit.mutate
  useEffect(() => {
    const id = setInterval(() => {
      const s = Math.ceil(initial - (Date.now() - mountedAt) / 1000)
      setSeconds(s)
      if (s <= 0 && !submitted.current) {
        submitted.current = true
        finish(undefined, { onSuccess: toResults, onError: (err) => toast.error(errorMessage(err) ?? "Couldn't submit the test.") })
      }
    }, 500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Closing the tab submits the test (a reload is told apart on the server by a short grace period).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    const leave = () => sendLeave(workspaceId, test.id)
    window.addEventListener("beforeunload", warn)
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("beforeunload", warn)
      window.removeEventListener("pagehide", leave)
    }
  }, [workspaceId, test.id])

  const go = (n: number) => {
    setI(n)
    setVisited((v) => new Set(v).add(test.items[n]!.position))
  }
  const choose = (n: number) =>
    save.mutate({ position: q.position, selected: n }, { onError: (err) => toast.error(errorMessage(err) ?? "Couldn't save that answer.") })
  const doSubmit = () => submit.mutate(undefined, { onSuccess: toResults, onError: (err) => toast.error(errorMessage(err) ?? "Couldn't submit the test.") })

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <p className="font-semibold">{test.topicName}</p>
        <div className="flex items-center gap-4">
          <p className={cn("flex items-center gap-1.5 font-mono text-sm", seconds <= 300 && "font-bold text-destructive")} role="timer" aria-label="Time left">
            <Clock className="size-4" /> {clock(seconds)}
          </p>
          <Button size="sm" onClick={() => setConfirm(true)}>
            Submit test
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label="Questions">
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
            {test.items.map((x, n) => {
              const state = x.selected !== null ? "answered" : visited.has(x.position) ? "unanswered" : "new"
              return (
                <button
                  key={x.position}
                  type="button"
                  onClick={() => go(n)}
                  aria-label={`Question ${n + 1}, ${state === "new" ? "not visited" : state}${x.marked ? ", marked for review" : ""}`}
                  aria-current={n === i}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-md border text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    state === "answered" && "border-success bg-success/20",
                    state === "unanswered" && "border-warning bg-warning/20",
                    state === "new" && "border-dashed text-muted-foreground",
                    n === i && "ring-2 ring-foreground",
                  )}
                >
                  {n + 1}
                  {x.marked && <Flag className="absolute -top-1 -right-1 size-3 fill-primary text-primary" />}
                </button>
              )
            })}
          </div>
          <dl className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><span className="size-3 rounded-sm border border-success bg-success/20" /> Answered ({answered})</div>
            <div className="flex items-center gap-2"><span className="size-3 rounded-sm border border-warning bg-warning/20" /> Not answered</div>
            <div className="flex items-center gap-2"><span className="size-3 rounded-sm border border-dashed" /> Not visited</div>
            <div className="flex items-center gap-2"><Flag className="size-3 fill-primary text-primary" /> Marked for review ({marked})</div>
          </dl>
        </aside>

        <main className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Question {i + 1} of {test.items.length}
            </p>
            <ProgressBar value={answered / test.items.length} label="Answered" />
          </div>
          <h2 className="whitespace-pre-wrap text-base font-semibold leading-snug">{q.question}</h2>
          <div role="radiogroup" aria-label="Answers" className="space-y-2">
            {q.options.map((o, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={q.selected === n}
                onClick={() => choose(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  q.selected === n ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">{"ABCD"[n]}</span>
                <span className="whitespace-pre-wrap">{o}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={q.marked ? "secondary" : "outline"}
              size="sm"
              onClick={() => mark.mutate({ position: q.position, marked: !q.marked }, { onError: (err) => toast.error(errorMessage(err) ?? "Couldn't mark that question.") })}
            >
              <Flag data-icon="inline-start" className={cn(q.marked && "fill-primary text-primary")} /> {q.marked ? "Marked for review" : "Mark for review"}
            </Button>
            {q.selected !== null && (
              <Button variant="ghost" size="sm" onClick={() => save.mutate({ position: q.position, selected: null })}>
                Clear answer
              </Button>
            )}
          </div>
          <div className="flex justify-between gap-2 border-t pt-4">
            <Button variant="outline" disabled={i === 0} onClick={() => go(i - 1)}>
              <ArrowLeft data-icon="inline-start" /> Previous
            </Button>
            <Button disabled={i === test.items.length - 1} onClick={() => go(i + 1)}>
              Next <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </main>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Submit the test?</DialogTitle>
            <DialogDescription>
              You answered {answered} of {test.items.length}
              {marked > 0 && `, and ${marked} ${marked === 1 ? "is" : "are"} marked for review`}. Unanswered questions score zero. You can&apos;t change answers after this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep going
            </Button>
            <Button disabled={submit.isPending} onClick={doSubmit}>
              {submit.isPending ? "Scoring…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Results({ workspaceId, test }: { workspaceId: string; test: Test }) {
  const [i, setI] = useState(0)
  const total = test.items.length
  const score = test.score ?? 0
  const skipped = test.items.filter((q) => q.selected === null).length
  const wrong = total - score - skipped
  const taken = test.submittedAt ? Math.round((new Date(test.submittedAt).getTime() - new Date(test.startedAt).getTime()) / 1000) : 0
  const q = test.items[i]!

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div>
          <p className="font-semibold">{test.topicName} · results</p>
          <p className="text-xs text-muted-foreground">
            {score} correct · {wrong} wrong · {skipped} skipped · {clock(taken)} of {Math.round(test.durationSeconds / 60)} min
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="font-mono text-lg font-bold">
            {score}/{total} <span className="text-sm font-medium text-muted-foreground">({Math.round((score / total) * 100)}%)</span>
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/workspaces/${workspaceId}/practice?tab=results`}>Back to my tests</Link>
          </Button>
        </div>
      </header>

      <div className={cn("mx-auto grid w-full flex-1 gap-6 p-4 sm:p-6", test.chatEnabled ? "max-w-7xl lg:grid-cols-[16rem_1fr_22rem]" : "max-w-6xl lg:grid-cols-[16rem_1fr]")}>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label="Questions">
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
            {test.items.map((x, n) => {
              const state = x.selected === null ? "skipped" : x.correct ? "correct" : "wrong"
              return (
                <button
                  key={x.position}
                  type="button"
                  onClick={() => setI(n)}
                  aria-label={`Question ${n + 1}, ${state}`}
                  aria-current={n === i}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    state === "correct" && "border-success bg-success/20",
                    state === "wrong" && "border-destructive bg-destructive/15",
                    state === "skipped" && "border-dashed text-muted-foreground",
                    n === i && "ring-2 ring-foreground",
                  )}
                >
                  {n + 1}
                </button>
              )
            })}
          </div>
          <dl className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><span className="size-3 rounded-sm border border-success bg-success/20" /> Correct ({score})</div>
            <div className="flex items-center gap-2"><span className="size-3 rounded-sm border border-destructive bg-destructive/15" /> Wrong ({wrong})</div>
            <div className="flex items-center gap-2"><span className="size-3 rounded-sm border border-dashed" /> Skipped ({skipped})</div>
          </dl>
        </aside>

        <main className="min-w-0 space-y-4 rounded-xl border bg-card p-5 shadow-xs">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {q.selected === null ? null : q.correct ? <Check className="size-4 text-success" /> : <X className="size-4 text-destructive" />}
            Question {i + 1} of {total}
          </p>
          <h2 className="whitespace-pre-wrap text-base font-semibold leading-snug">{q.question}</h2>
          <ul className="space-y-2 text-sm">
            {q.options.map((o, k) => (
              <li
                key={k}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3",
                  k === q.answer && "border-success bg-success/10 font-medium",
                  k === q.selected && k !== q.answer && "border-destructive bg-destructive/10",
                )}
              >
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">{"ABCD"[k]}</span>
                <span className="whitespace-pre-wrap">{o}</span>
                {k === q.answer && <span className="ml-auto shrink-0 text-xs text-success">Correct</span>}
                {k === q.selected && k !== q.answer && <span className="ml-auto shrink-0 text-xs text-destructive">Your answer</span>}
              </li>
            ))}
          </ul>
          {q.selected === null && <p className="text-xs text-muted-foreground">You skipped this question.</p>}
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Explanation: </span>
            {q.explanation}
          </p>
          <div className="flex justify-between gap-2 border-t pt-4">
            <Button variant="outline" disabled={i === 0} onClick={() => setI(i - 1)}>
              <ArrowLeft data-icon="inline-start" /> Previous
            </Button>
            <Button disabled={i === total - 1} onClick={() => setI(i + 1)}>
              Next <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </main>

        {test.chatEnabled && (
          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start" aria-label="Ask about this question">
            {/* Keyed by question: moving on switches the conversation to that question. */}
            <QuestionChat key={q.position} workspaceId={workspaceId} testId={test.id} position={q.position} number={i + 1} />
          </aside>
        )}
      </div>
    </div>
  )
}
