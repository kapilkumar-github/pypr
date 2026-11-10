"use client"

import Link from "next/link"
import { ArrowRight, Clock, Plus, RotateCw, Target } from "lucide-react"

import { useUser } from "@/components/app/user-context"
import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { PageHeader } from "@/components/common/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import { useWorkspaces, type WorkspaceSummary } from "@/lib/api/workspaces"
import { timeAgo } from "@/lib/resume/format"
import { cn } from "@/lib/utils"
import { ProgressBar } from "./progress-bar"

export function WorkspaceList() {
  const user = useUser()
  const workspaces = useWorkspaces()
  const has = !!workspaces.data?.length

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow={
          <>
            Workspace <span className="text-border">/</span> {user.name}
          </>
        }
        title="Workspaces"
        description="One workspace per role you're preparing for, each with its own plan and progress."
        actions={
          has ? (
            <Button asChild>
              <Link href="/workspaces/new">
                <Plus data-icon="inline-start" /> New workspace
              </Link>
            </Button>
          ) : undefined
        }
      />

      {workspaces.isPending && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading workspaces">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      )}

      {workspaces.isError && (
        <div className="space-y-3">
          <FormAlert message={errorMessage(workspaces.error) ?? "Couldn't load your workspaces."} />
          <Button variant="outline" onClick={() => workspaces.refetch()}>
            <RotateCw data-icon="inline-start" /> Try again
          </Button>
        </div>
      )}

      {workspaces.data?.length === 0 && (
        <EmptyState
          icon={Target}
          title="No workspaces yet"
          description="Create one for the role you're preparing for, or start from a resume with Prepare for a role."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/workspaces/new">
                  <Plus data-icon="inline-start" /> Create workspace
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/resumes">Start from a resume</Link>
              </Button>
            </div>
          }
        />
      )}

      {has && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/workspaces/new"
            className="group flex min-h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card p-6 text-center transition-colors outline-none hover:border-primary hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground">
              <Plus className="size-5" />
            </span>
            <span className="mt-3 font-semibold">New workspace</span>
            <span className="mt-1 text-sm text-muted-foreground">Prepare for another role.</span>
          </Link>
          {workspaces.data!.map((w) => (
            <WorkspaceCard key={w.id} workspace={w} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspaceCard({ workspace: w }: { workspace: WorkspaceSummary }) {
  const percent = w.activitiesTotal ? Math.round((w.activitiesDone / w.activitiesTotal) * 100) : 0
  return (
    <Card className="group relative gap-0 p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className={cn("flex flex-wrap gap-1.5", (w.seniority || w.technologies.length > 0) && "mb-3")}>
        {w.seniority && (
          <Badge variant="secondary" className="text-[11px] font-bold tracking-wide uppercase">
            {w.seniority}
          </Badge>
        )}
        {w.technologies.slice(0, 4).map((t) => (
          <Badge key={t} variant="outline" className="text-[11px] text-muted-foreground">
            {t}
          </Badge>
        ))}
      </div>
      <Link
        href={`/workspaces/${w.id}`}
        className="block truncate font-semibold outline-none group-hover:text-primary after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
      >
        {w.name}
      </Link>
      {w.name !== w.targetRole && <p className="truncate text-xs text-muted-foreground">{w.targetRole}</p>}
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Plan completion</span>
          <span className="font-medium">
            {w.activitiesTotal ? `${w.activitiesDone} of ${w.activitiesTotal} activities` : "No plan yet"}
          </span>
        </div>
        <ProgressBar value={percent / 100} label={`Plan completion ${percent}%`} />
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-[11px] font-semibold text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" /> Updated {timeAgo(w.updatedAt)}
        </span>
        <span className="flex items-center gap-1 text-primary">
          Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Card>
  )
}
