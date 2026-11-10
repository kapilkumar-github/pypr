"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, CircleHelp, LoaderCircle, Play, RotateCcw, Send, X } from "lucide-react"
import { toast } from "sonner"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { FormAlert } from "@/components/common/form-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import { useCodeProblem, useJudge, useSolution, useSubmitAttempt, type Problem, type ProblemLanguage, type ServerLanguage, type Verdict } from "@/lib/api/code"
import { buildHtmlDoc, runCode, type Files, type LogLine } from "@/lib/code/runner"
import { LANGUAGES, languageName, TEMPLATES } from "@/lib/code/templates"
import { cn } from "@/lib/utils"
import { CodeEditor } from "./editor"
import { Markdown } from "./markdown"

const LANGUAGE_NAME: Record<ProblemLanguage, string> = { javascript: "JavaScript", typescript: "TypeScript", nodejs: "Node.js", html: "HTML + CSS", stdio: "Any language" }
const VERDICT: Record<Verdict, string> = { accepted: "Accepted", wrong_answer: "Wrong answer", runtime_error: "Runtime error", time_limit: "Time limit exceeded" }
const draftKey = (id: string) => `pypr:code:${id}`

function readDraft(id: string): Files | null {
  try {
    const v = JSON.parse(localStorage.getItem(draftKey(id)) ?? "null")
    return v && typeof v === "object" ? (v as Files) : null
  } catch {
    return null
  }
}

/** What the output panel shows, whichever runner produced it. */
type Shown = {
  full: boolean
  passed: number
  total: number
  tests: { label: string; ok: boolean; verdict?: string; error?: string; input?: string; expected?: string; stdout?: string }[]
  /** Compile or load error that stopped everything. */
  fatal?: string
  logs: LogLine[]
}

/** Problem on the left; editor top right; tests, console and preview bottom right. */
export function Playground({ workspaceId, problemId }: { workspaceId: string; problemId: string }) {
  const problem = useCodeProblem(workspaceId, problemId)
  if (problem.isPending) return <Skeleton className="m-6 h-[80svh] rounded-xl" aria-label="Loading problem" />
  if (problem.isError) return <div className="mx-auto max-w-xl p-6"><FormAlert message={errorMessage(problem.error) ?? "Couldn't load this problem."} /></div>
  return <Workbench workspaceId={workspaceId} problem={problem.data} />
}

type Tab = "tests" | "console" | "preview"

function initialFiles(problem: Problem): Files {
  const saved = readDraft(problem.id) ?? {}
  if (problem.language === "stdio") {
    return Object.fromEntries(LANGUAGES.map((l) => [l.id, saved[l.id] ?? problem.last?.[l.id] ?? TEMPLATES[l.id]]))
  }
  return Object.fromEntries(Object.keys(problem.starter).map((n) => [n, saved[n] ?? problem.last?.[n] ?? problem.starter[n] ?? ""]))
}

function Workbench({ workspaceId, problem }: { workspaceId: string; problem: Problem }) {
  const verified = useVerified()
  const submit = useSubmitAttempt(workspaceId, problem.id)
  const judge = useJudge(workspaceId, problem.id)
  const server = problem.runner === "server"
  const stdio = problem.language === "stdio"
  const [files, setFiles] = useState<Files>(() => initialFiles(problem))
  const names = Object.keys(files)
  const [active, setActive] = useState(() => {
    if (!stdio) return names[0]!
    const last = Object.keys(problem.last ?? {}).find((k) => k in files)
    return last ?? "nodejs"
  })
  const [resetKey, setResetKey] = useState(0)
  const [result, setResult] = useState<Shown | null>(null)
  const [running, setRunning] = useState<"run" | "submit" | null>(null)
  const [tab, setTab] = useState<Tab>("tests")
  const [left, setLeft] = useState<"description" | "solution">("description")
  const [showHint, setShowHint] = useState(false)
  const filesRef = useRef(files)
  const activeRef = useRef(active)
  useEffect(() => {
    filesRef.current = files
    activeRef.current = active
    try {
      localStorage.setItem(draftKey(problem.id), JSON.stringify(files))
    } catch {
      /* private mode: the draft just isn't kept */
    }
  }, [files, active, problem.id])

  const html = problem.language === "html"
  const solution = useSolution(workspaceId, problem.id, problem.attempted && left === "solution")

  // Live preview for HTML problems, a moment after typing stops.
  const [previewDoc, setPreviewDoc] = useState(() => (html ? buildHtmlDoc(files) : ""))
  useEffect(() => {
    if (!html) return
    const t = setTimeout(() => setPreviewDoc(buildHtmlDoc(files)), 300)
    return () => clearTimeout(t)
  }, [files, html])


  const execute = async (full: boolean) => {
    if (running) return
    setRunning(full ? "submit" : "run")
    setTab("tests")
    try {
      if (server) {
        if (!verified) return verifyFirst()
        const language = (stdio ? activeRef.current : problem.language) as ServerLanguage
        const source = filesRef.current[stdio ? language : Object.keys(filesRef.current)[0]!] ?? ""
        const r = await judge.mutateAsync({ language, source, submit: full })
        let seen = 0
        setResult({
          full,
          passed: r.passed,
          total: r.total,
          fatal: r.fatal,
          logs: r.console ? r.console.split("\n").map((text) => ({ level: "log" as const, text })) : [],
          tests: r.tests.map((t) => ({
            label: t.hidden ? `Hidden test ${++seen}` : t.name,
            ok: t.verdict === "accepted",
            verdict: VERDICT[t.verdict],
            error: t.error,
            input: t.input,
            expected: t.expected,
            stdout: t.stdout,
          })),
        })
        if (full) toast[r.passed === r.total ? "success" : "message"](r.passed === r.total ? "All tests passed. Solution unlocked." : `${r.passed} of ${r.total} tests passed. Solution unlocked.`)
        return
      }
      const chosen = problem.tests.filter((t) => full || !t.hidden).map((t) => ({ name: t.name, code: t.code ?? "", hidden: t.hidden }))
      const run = await runCode(problem.language as "javascript" | "html", filesRef.current, chosen)
      let seen = 0
      setResult({
        full,
        passed: run.tests.filter((t) => t.ok).length,
        total: run.tests.length,
        fatal: run.tests.every((t) => !t.ok) ? run.error : undefined,
        logs: run.logs,
        tests: run.tests.map((t, n) => ({ label: chosen[n]?.hidden ? `Hidden test ${++seen}` : t.name, ok: t.ok, error: chosen[n]?.hidden ? undefined : t.error })),
      })
      if (full) {
        const passed = run.tests.filter((t) => t.ok).length
        if (!verified) return verifyFirst()
        submit.mutate(
          { files: filesRef.current, passed, total: chosen.length },
          {
            onSuccess: () => toast[passed === chosen.length ? "success" : "message"](passed === chosen.length ? "All tests passed. Solution unlocked." : `${passed} of ${chosen.length} tests passed. Solution unlocked.`),
            onError: (err) => toast.error(errorMessage(err) ?? "Couldn't save your attempt."),
          },
        )
      }
    } catch (err) {
      toast.error(errorMessage(err) ?? "Couldn't run your code.")
    } finally {
      setRunning(null)
    }
  }

  const visibleCount = problem.tests.filter((t) => !t.hidden).length
  const editorFile = stdio ? (LANGUAGES.find((l) => l.id === active)?.file ?? "main.js") : active
  const showTabs = !stdio && names.length > 1
  const resetAll = () => {
    if (!confirm("Reset your code to the starting point?")) return
    if (stdio) setFiles((f) => ({ ...f, [active]: TEMPLATES[active as ServerLanguage] }))
    else setFiles(Object.fromEntries(names.map((n) => [n, problem.starter[n] ?? ""])))
    setResetKey((k) => k + 1)
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2 shrink-0 text-muted-foreground">
            <Link href={`/workspaces/${workspaceId}/practice`}>
              <ArrowLeft data-icon="inline-start" /> Practice
            </Link>
          </Button>
          <h1 className="truncate font-semibold">{problem.title}</h1>
          <Badge variant="secondary" className="shrink-0 capitalize">{problem.difficulty}</Badge>
          {!stdio && <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{LANGUAGE_NAME[problem.language]}</Badge>}
          {problem.solved && <Check className="size-4 shrink-0 text-success" aria-label="Solved" />}
        </div>
        <div className="flex items-center gap-2">
          {stdio && (
            <select
              aria-label="Language"
              value={active}
              onChange={(e) => {
                setActive(e.target.value)
                setResult(null)
              }}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {LANGUAGES.filter((l) => !problem.languages || problem.languages.includes(l.id)).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw data-icon="inline-start" /> Reset
          </Button>
          <Button variant="outline" size="sm" disabled={running !== null} onClick={() => void execute(false)} title="Run the example tests (Ctrl/Cmd + Enter)">
            {running === "run" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />} Run
          </Button>
          <Button size="sm" disabled={running !== null || submit.isPending} onClick={() => void execute(true)}>
            {running === "submit" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />} Submit
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-px bg-border lg:grid-cols-2">
        <section className="flex min-h-0 flex-col bg-card" aria-label="Problem">
          <div className="flex gap-1 border-b px-3 pt-2" role="tablist">
            {(["description", "solution"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={left === t}
                disabled={t === "solution" && !problem.attempted}
                onClick={() => setLeft(t)}
                title={t === "solution" && !problem.attempted ? "Unlocks after your first submit" : undefined}
                className={cn("border-b-2 px-3 py-1.5 text-sm font-medium capitalize disabled:opacity-50", left === t ? "border-primary" : "border-transparent text-muted-foreground")}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {left === "description" ? (
              <div className="space-y-4">
                <Markdown source={problem.statement} />
                {problem.hint && (
                  <div>
                    <Button variant="outline" size="sm" onClick={() => setShowHint((v) => !v)}>
                      <CircleHelp data-icon="inline-start" /> {showHint ? "Hide hint" : "Show hint"}
                    </Button>
                    {showHint && <p className="mt-2 rounded-lg bg-muted p-3 text-sm">{problem.hint}</p>}
                  </div>
                )}
              </div>
            ) : solution.isPending ? (
              <Skeleton className="h-40" />
            ) : solution.isError ? (
              <FormAlert message={errorMessage(solution.error) ?? "Couldn't load the solution."} />
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">One possible solution{stdio ? " (in Python)" : ""}. Yours doesn&apos;t have to match.</p>
                {Object.entries(solution.data).map(([name, code]) => (
                  <div key={name}>
                    <p className="mb-1 font-mono text-xs text-muted-foreground">{name}</p>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{code}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="grid min-h-0 grid-rows-[3fr_2fr] gap-px bg-border">
          <section className="flex min-h-0 flex-col bg-card" aria-label="Code">
            {showTabs && (
              <div className="flex gap-1 border-b px-3 pt-2" role="tablist">
                {names.map((n) => (
                  <button key={n} role="tab" aria-selected={active === n} onClick={() => setActive(n)} className={cn("border-b-2 px-3 py-1.5 font-mono text-xs", active === n ? "border-primary" : "border-transparent text-muted-foreground")}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            <div className="min-h-0 flex-1">
              <CodeEditor
                key={`${active}-${resetKey}`}
                file={editorFile}
                value={files[active] ?? ""}
                onChange={(v) => setFiles((f) => ({ ...f, [active]: v }))}
                onRun={() => void execute(false)}
              />
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-card" aria-label="Output">
            <div className="flex items-center gap-1 border-b px-3 pt-2" role="tablist">
              {(["tests", "console", ...(html ? (["preview"] as const) : [])] as Tab[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("border-b-2 px-3 py-1.5 text-sm font-medium capitalize", tab === t ? "border-primary" : "border-transparent text-muted-foreground")}>
                  {t}
                  {t === "console" && result && result.logs.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({result.logs.length})</span>}
                </button>
              ))}
              {result && (
                <span className={cn("ml-auto pb-1 text-xs font-medium", result.passed === result.total ? "text-success" : "text-muted-foreground")}>
                  {result.passed}/{result.total} passed{!result.full && " (examples)"}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
              {tab === "preview" ? (
                <iframe title="Preview" sandbox="allow-scripts" srcDoc={previewDoc} className="h-full min-h-40 w-full rounded-md border bg-white" />
              ) : !result ? (
                <p className="text-muted-foreground">
                  {running
                    ? server
                      ? `Running on the server in ${languageName(stdio ? (active as ServerLanguage) : (problem.language as ServerLanguage))}…`
                      : "Running…"
                    : `Run checks the ${visibleCount} example test${visibleCount === 1 ? "" : "s"}. Submit runs all ${visibleCount + problem.hiddenCount || problem.tests.length} including hidden ones.`}
                </p>
              ) : tab === "console" ? (
                result.fatal || result.logs.length > 0 ? (
                  <pre className="space-y-0.5 font-mono text-xs">
                    {result.fatal && <div className="whitespace-pre-wrap text-destructive">{result.fatal}</div>}
                    {result.logs.map((l, n) => (
                      <div key={n} className={cn(l.level === "error" && "text-destructive", l.level === "warn" && "text-warning")}>
                        {l.text}
                      </div>
                    ))}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">Nothing printed. Use console.log to see values here.</p>
                )
              ) : (
                <div className="space-y-2">
                  {result.fatal && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-2 font-mono text-xs text-destructive">{result.fatal}</pre>}
                  <ul className="space-y-2">
                    {result.tests.map((t, n) => (
                      <li key={n} className="flex items-start gap-2">
                        {t.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" />}
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{t.label}</span>
                          {!t.ok && t.verdict && <span className="ml-2 text-xs text-muted-foreground">{t.verdict}</span>}
                          {!t.ok && t.error && !result.fatal && <span className="block break-words font-mono text-xs text-muted-foreground">{t.error}</span>}
                          {!t.ok && t.input !== undefined && t.expected !== undefined && !result.fatal && (
                            <span className="mt-1 grid gap-1 font-mono text-xs sm:grid-cols-3">
                              <Block title="Input" text={t.input} />
                              <Block title="Expected" text={t.expected} />
                              <Block title="Your output" text={t.stdout ?? ""} />
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <span className="block min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{title}</span>
      <span className="block max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-1.5">{text || " "}</span>
    </span>
  )
}
