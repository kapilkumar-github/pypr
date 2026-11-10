"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, ChevronRight, ClipboardCheck, Code2, LoaderCircle, MessageSquareText } from "lucide-react"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { FormAlert } from "@/components/common/form-alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { codeUrl, useCodeProblems, type CodeKind } from "@/lib/api/code"
import { testUrl, useStartTest, type McqTopic } from "@/lib/api/mcq"
import { cn } from "@/lib/utils"

const DEFAULT_QUESTIONS = 50
// Auto time: about 36 seconds a question, which gives the 30 minutes for 50 questions.
const autoMinutes = (questions: number) => Math.max(5, Math.min(180, Math.ceil(questions * 0.6)))
const PRESETS = [25, 50, 100]

type Mode = { key: string; name: string; description: string; icon: typeof Code2; ready: boolean; code?: CodeKind }

/** Practice modes for a topic. Coding modes are ready when the topic has problems of that kind. */
function modesFor(topic: McqTopic): Mode[] {
  const machine = topic.codeCounts?.machine_coding ?? 0
  const dsa = topic.codeCounts?.dsa ?? 0
  return [
    { key: "mcq", name: "MCQs", description: "Timed multiple-choice test with explanations and a tutor chat.", icon: ClipboardCheck, ready: topic.questionCount >= 5 },
    ...(dsa > 0
      ? [{ key: "dsa", name: "DSA problems", description: `${dsa} problems in a code playground.`, icon: Code2, ready: true, code: "dsa" as const }]
      : [{ key: "machine-coding", name: "Machine coding", description: machine > 0 ? `${machine} small build-it problems in a code playground.` : "Build a small working piece of code in a playground.", icon: Code2, ready: machine > 0, code: "machine_coding" as const }]),
    { key: "qa", name: "Q&A", description: "Answer by typing or speaking and get feedback.", icon: MessageSquareText, ready: false },
  ]
}

/** Side drawer for a topic: the practice modes available for it. MCQs opens its start form (default 50 questions). */
export function PracticeDrawer({ workspaceId, topic, onClose }: { workspaceId: string; topic: McqTopic | null; onClose: () => void }) {
  return (
    <Sheet open={topic !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">{topic && <Modes key={topic.key} workspaceId={workspaceId} topic={topic} />}</SheetContent>
    </Sheet>
  )
}

function Modes({ workspaceId, topic }: { workspaceId: string; topic: McqTopic }) {
  const [mode, setMode] = useState<string | null>(null)
  return (
    <div className="space-y-4 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>{topic.name}</SheetTitle>
        <SheetDescription>{topic.description}</SheetDescription>
      </SheetHeader>
      <ul className="space-y-2">
        {modesFor(topic).map((m) => {
          const available = m.ready
          return (
            <li key={m.key} className="rounded-xl border">
              <button
                type="button"
                disabled={!available}
                onClick={() => setMode(mode === m.key ? null : m.key)}
                aria-expanded={mode === m.key}
                className="flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <m.icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {m.name}
                    {!m.ready && <span className="ml-2 text-[10px] font-normal text-muted-foreground">{m.key === "mcq" ? "No questions yet" : "Soon"}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {m.key === "mcq"
                      ? topic.questionCount < 5
                        ? "Questions are still being added."
                        : `${topic.questionCount} questions${topic.attempts ? ` · ${topic.attempts} taken` : ""}${topic.bestPercent !== null ? ` · best ${topic.bestPercent}%` : ""}`
                      : m.description}
                  </span>
                </span>
                {available && <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", mode === m.key && "rotate-90")} />}
              </button>
              {mode === m.key && m.key === "mcq" && (
                <div className="border-t p-3">
                  <Form workspaceId={workspaceId} topic={topic} />
                </div>
              )}
              {mode === m.key && m.code && <ProblemList workspaceId={workspaceId} topic={topic.key} kind={m.code} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ProblemList({ workspaceId, topic, kind }: { workspaceId: string; topic: string; kind: CodeKind }) {
  const problems = useCodeProblems(workspaceId, topic, kind, true)
  return (
    <div className="border-t p-1">
      {problems.isPending ? (
        <p className="p-3 text-xs text-muted-foreground">Loading…</p>
      ) : problems.isError ? (
        <p className="p-3 text-xs text-destructive">Couldn&apos;t load the problems.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {problems.data.map((p) => (
            <li key={p.id}>
              <Link href={codeUrl(workspaceId, p.id)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                {p.solved ? <Check className="size-4 shrink-0 text-success" aria-label="Solved" /> : <span className="size-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="shrink-0 text-xs capitalize text-muted-foreground">{p.difficulty}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Form({ workspaceId, topic }: { workspaceId: string; topic: McqTopic }) {
  const router = useRouter()
  const verified = useVerified()
  const start = useStartTest(workspaceId)
  const [questions, setQuestions] = useState(String(Math.min(DEFAULT_QUESTIONS, topic.questionCount)))
  const [auto, setAuto] = useState(true)
  const [minutes, setMinutes] = useState("30")
  const n = Number(questions)
  const m = auto ? autoMinutes(n) : Number(minutes)
  const errors = fieldErrors(start.error)
  const valid = Number.isInteger(n) && n >= 5 && n <= Math.min(200, topic.questionCount) && Number.isInteger(m) && m >= 5 && m <= 180

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!verified) return verifyFirst()
        start.mutate({ topic: topic.key, questions: n, durationMinutes: m }, { onSuccess: (t) => router.push(testUrl(workspaceId, t.id)) })
      }}
    >
      <p className="text-xs text-muted-foreground">
        {topic.unseenCount < topic.questionCount ? `${topic.unseenCount} of ${topic.questionCount} questions you haven't seen. ` : ""}Unseen questions come first.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="mcq-questions">Questions</Label>
        <div className="flex items-center gap-2">
          <Input id="mcq-questions" type="number" inputMode="numeric" min={5} max={Math.min(200, topic.questionCount)} className="w-24" value={questions} onChange={(e) => setQuestions(e.target.value)} />
          {PRESETS.filter((p) => p <= topic.questionCount).map((p) => (
            <Button key={p} type="button" size="sm" variant="outline" className={cn(n === p && "border-primary")} onClick={() => setQuestions(String(p))}>
              {p}
            </Button>
          ))}
        </div>
        {errors.questions && <p className="text-xs text-destructive">{errors.questions}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="mcq-minutes">Time (minutes)</Label>
          <div role="group" aria-label="Time mode" className="flex gap-1">
            <Button type="button" size="xs" variant={auto ? "default" : "outline"} onClick={() => setAuto(true)}>
              Auto
            </Button>
            <Button type="button" size="xs" variant={auto ? "outline" : "default"} onClick={() => { setMinutes(String(Number.isFinite(m) ? m : 30)); setAuto(false) }}>
              Manual
            </Button>
          </div>
        </div>
        <Input
          id="mcq-minutes"
          type="number"
          inputMode="numeric"
          min={5}
          max={180}
          className="w-24"
          value={auto ? (Number.isFinite(m) ? m : "") : minutes}
          onChange={(e) => setMinutes(e.target.value)}
          disabled={auto}
        />
        <p className="text-xs text-muted-foreground">
          {auto ? "Set from the number of questions." : ""} The timer starts now. Closing the tab submits the test. Unanswered questions score zero.
        </p>
        {errors.durationMinutes && <p className="text-xs text-destructive">{errors.durationMinutes}</p>}
      </div>

      {start.isError && !errors.questions && !errors.durationMinutes && <FormAlert message={errorMessage(start.error) ?? "Couldn't start the test."} />}
      <SheetFooter className="p-0">
        <Button type="submit" disabled={!valid || start.isPending}>
          {start.isPending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ClipboardCheck data-icon="inline-start" />}
          Start test
        </Button>
      </SheetFooter>
    </form>
  )
}
