"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ListChecks, Search } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { errorMessage } from "@/lib/api/client"
import { testUrl, useMcqTopics, useTests, type McqTopic, type TestSummary } from "@/lib/api/mcq"
import { PracticeDrawer } from "./start-test-dialog"
import { useActiveWorkspace } from "./workspace-frame"

const TABS = ["selected", "all", "results"] as const
type Tab = (typeof TABS)[number]

/** Practice: topics picked for this role, every topic, and the tests taken so far. */
export function TestsView() {
  const w = useActiveWorkspace()
  const router = useRouter()
  const pathname = usePathname()
  const raw = useSearchParams().get("tab")
  const tab: Tab = TABS.find((t) => t === raw) ?? "selected"
  const topics = useMcqTopics(w.id)
  const [starting, setStarting] = useState<McqTopic | null>(null)

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })}>
        <TabsList>
          <TabsTrigger value="selected">Selected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "results" ? (
        <Results workspaceId={w.id} />
      ) : topics.isPending ? (
        <Skeleton className="h-64 rounded-xl" aria-label="Loading topics" />
      ) : topics.isError ? (
        <FormAlert message={errorMessage(topics.error) ?? "Couldn't load the topics."} />
      ) : tab === "selected" ? (
        <Selected topics={topics.data.filter((t) => t.selected)} role={w.targetRole} onStart={setStarting} />
      ) : (
        <All topics={topics.data} onStart={setStarting} />
      )}
      <PracticeDrawer workspaceId={w.id} topic={starting} onClose={() => setStarting(null)} />
    </div>
  )
}

function Selected({ topics, role, onStart }: { topics: McqTopic[]; role: string; onStart: (t: McqTopic) => void }) {
  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Topics that match {role ? `your ${role} preparation` : "this workspace"}, from your resume and role. Find everything else under All.
      </p>
      <Grid topics={topics} onStart={onStart} />
    </div>
  )
}

function All({ topics, onStart }: { topics: McqTopic[]; onStart: (t: McqTopic) => void }) {
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const shown = topics.filter((t) => !query || `${t.name} ${t.area} ${t.description}`.toLowerCase().includes(query))
  const areas = [...new Set(shown.map((t) => t.area))]
  return (
    <div className="space-y-5">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics" aria-label="Search topics" />
      </div>
      {areas.length === 0 && <p className="py-6 text-sm text-muted-foreground">No topics match.</p>}
      {areas.map((a) => (
        <section key={a} className="space-y-2">
          <h2 className="text-xs font-bold text-muted-foreground">{a}</h2>
          <Grid topics={shown.filter((t) => t.area === a)} onStart={onStart} />
        </section>
      ))}
    </div>
  )
}

function Grid({ topics, onStart }: { topics: McqTopic[]; onStart: (t: McqTopic) => void }) {
  if (topics.length === 0) return <EmptyState icon={ListChecks} title="No topics here" description="Open the All tab to browse every topic." />
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((t) => (
        <li key={t.key}>
          <button
            type="button"
            onClick={() => onStart(t)}
            className="flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{t.name}</h3>
                {t.bestPercent !== null && <Badge variant="secondary">Best {t.bestPercent}%</Badge>}
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {t.questionCount === 0 ? "Questions coming soon" : `${t.questionCount} questions${t.attempts ? ` · ${t.attempts} taken` : ""}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

function status(t: TestSummary) {
  if (t.submittedAt) return "done"
  return new Date(t.deadline).getTime() > Date.now() ? "open" : "done"
}

function Results({ workspaceId }: { workspaceId: string }) {
  const tests = useTests(workspaceId)
  if (tests.isPending) return <Skeleton className="h-48 rounded-xl" aria-label="Loading results" />
  if (tests.isError) return <FormAlert message={errorMessage(tests.error) ?? "Couldn't load your tests."} />
  if (tests.data.length === 0) return <EmptyState icon={ListChecks} title="No tests taken yet" description="Start one from Selected or All. Your results will be listed here." />
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
      {tests.data.map((t) => {
        const open = status(t) === "open"
        const percent = t.score === null ? null : Math.round((t.score / t.questions) * 100)
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-40 flex-1">
              <p className="text-sm font-medium">{t.topicName}</p>
              <p className="text-xs text-muted-foreground">
                {fmt.format(new Date(t.startedAt))} · {t.questions} questions · {Math.round(t.durationSeconds / 60)} min
              </p>
            </div>
            {open ? (
              <Badge>In progress</Badge>
            ) : (
              <span className="font-mono text-sm">
                {t.score ?? 0}/{t.questions}
                {percent !== null && <span className="ml-1.5 text-muted-foreground">({percent}%)</span>}
              </span>
            )}
            <Button size="sm" variant={open ? "default" : "outline"} asChild>
              <Link href={testUrl(workspaceId, t.id)}>
                {open ? "Resume" : "Review"}
              </Link>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
