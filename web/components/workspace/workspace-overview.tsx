"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { FileText, ListChecks, PartyPopper, Target } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { testUrl, useTests } from "@/lib/api/mcq"
import { type Workspace } from "@/lib/api/workspaces"
import { TRACKS } from "@/lib/workspace/meta"
import { cn } from "@/lib/utils"
import { useActiveWorkspace } from "./workspace-frame"

function Card({ title, icon, action, children, className }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-xs", className)} aria-label={title}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-primary [&_svg]:size-4">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Workspace home: the role context and the latest tests. */
export function WorkspaceOverview() {
  const w = useActiveWorkspace()
  const justCreated = useSearchParams().get("created") === "1"
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {justCreated && (
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <PartyPopper className="size-4" /> Workspace created
          </p>
        )}
        <RecentTests workspace={w} />
      </div>
      <Overview workspace={w} />
    </div>
  )
}

const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

function RecentTests({ workspace: w }: { workspace: Workspace }) {
  const tests = useTests(w.id)
  const latest = tests.data?.slice(0, 5) ?? []
  return (
    <Card
      title="Recent practice"
      icon={<ListChecks />}
      action={
        <Button variant="ghost" size="xs" asChild>
          <Link href={`/workspaces/${w.id}/practice`}>All practice</Link>
        </Button>
      }
    >
      {tests.isPending ? (
        <Skeleton className="h-20" />
      ) : latest.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No practice yet.{" "}
          <Link href={`/workspaces/${w.id}/practice`} className="font-semibold text-primary hover:underline">
            Start a multiple-choice test
          </Link>{" "}
          on a topic for this role.
        </p>
      ) : (
        <ul className="divide-y">
          {latest.map((t) => {
            const open = !t.submittedAt // the API closes tests whose time is up
            return (
              <li key={t.id}>
                <Link href={testUrl(w.id, t.id)} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.topicName}</span>
                    <span className="text-xs text-muted-foreground">{fmt.format(new Date(t.startedAt))}</span>
                  </span>
                  {open ? <Badge>In progress</Badge> : <span className="font-mono">{t.score ?? 0}/{t.questions}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Overview({ workspace: w }: { workspace: Workspace }) {
  const rows: [string, React.ReactNode][] = [
    ["Target role", w.targetRole],
    ["Seniority", w.seniority || "Not set"],
    ["Track", TRACKS.find((t) => t.id === w.track)?.name],
    ["Experience", w.yearsExperience != null ? `${w.yearsExperience} years` : "Not set"],
  ]
  return (
    <Card
      title="Workspace"
      icon={<Target />}
      action={
        <Button variant="ghost" size="xs" asChild>
          <Link href={`/workspaces/${w.id}/settings`}>Edit</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 truncate font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {w.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {w.technologies.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {w.objectives && <p className="text-sm whitespace-pre-line text-muted-foreground">{w.objectives}</p>}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Resume</p>
          {w.resumes.length ? (
            w.resumes.map((r) => (
              <Link key={r.id} href={`/resumes/${r.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                <FileText className="size-4 text-muted-foreground" /> <span className="truncate">{r.title}</span>
              </Link>
            ))
          ) : (
            <Link href={`/workspaces/${w.id}/settings`} className="text-sm font-medium text-primary hover:underline">
              Link a resume
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}
