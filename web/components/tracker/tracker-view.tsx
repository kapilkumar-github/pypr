"use client"

import { useDeferredValue, useMemo, useState } from "react"
import Link from "next/link"
import { Columns3, MapPin, Plus, RotateCw, Search, SquareKanban, Table2 } from "lucide-react"

import { useUser } from "@/components/app/user-context"
import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { PageHeader } from "@/components/common/page-header"
import { Segmented } from "@/components/common/segmented"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import { useTrackedJobs, type ListParams, type TrackedJob } from "@/lib/api/tracker"
import {
  ARRANGEMENTS,
  SOURCES,
  STATUSES,
  arrangementName,
  formatDate,
  sourceName,
} from "@/lib/tracker/meta"
import { cn } from "@/lib/utils"
import { DueBadge } from "./due-badge"
import { StatusSelect } from "./status-select"

const ALL = "all"

type View = "board" | "table"

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onChange: (v: string) => void
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-0 flex-1 sm:flex-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TrackerView() {
  const user = useUser()
  const [view, setView] = useState<View>("board")
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<Omit<ListParams, "q">>({ status: "", source: "", arrangement: "", sort: "updated" })
  const q = useDeferredValue(search)
  const jobs = useTrackedJobs({ ...filters, q })

  const items = useMemo(() => jobs.data?.pages.flatMap((p) => p.items) ?? [], [jobs.data])
  const total = jobs.data?.pages[0]?.total ?? 0
  const filtered = !!(q.trim() || filters.status || filters.source || filters.arrangement)
  const empty = jobs.isSuccess && total === 0

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow={
          <>
            Job tracker <span className="text-border">/</span> {user.name}
          </>
        }
        title="Job tracker"
        description="Save jobs, apply on the employer's site, then track each application through interviews."
        actions={
          <Button asChild>
            <Link href="/job-tracker/new">
              <Plus data-icon="inline-start" /> Add job
            </Link>
          </Button>
        }
      />

      {!(empty && !filtered) && (
        <Card className="flex flex-col gap-3 p-3 shadow-xs lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or title"
              aria-label="Search company or title"
              className="h-8 pl-8"
              maxLength={200}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Statuses" value={filters.status} options={STATUSES} onChange={(v) => setFilters({ ...filters, status: v as ListParams["status"] })} />
            <FilterSelect label="Sources" value={filters.source} options={SOURCES} onChange={(v) => setFilters({ ...filters, source: v as ListParams["source"] })} />
            <FilterSelect
              label="Arrangements"
              value={filters.arrangement}
              options={ARRANGEMENTS}
              onChange={(v) => setFilters({ ...filters, arrangement: v as ListParams["arrangement"] })}
            />
            <Select value={filters.sort} onValueChange={(v) => setFilters({ ...filters, sort: v as ListParams["sort"] })}>
              <SelectTrigger size="sm" aria-label="Sort" className="min-w-0 flex-1 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="created">Date saved</SelectItem>
                <SelectItem value="applied">Applied date</SelectItem>
              </SelectContent>
            </Select>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { id: "board", name: "Board", icon: <Columns3 /> },
                { id: "table", name: "Table", icon: <Table2 /> },
              ]}
            />
          </div>
        </Card>
      )}

      {jobs.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading jobs">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      )}

      {jobs.isError && (
        <div className="space-y-3">
          <FormAlert message={errorMessage(jobs.error) ?? "Couldn't load your jobs."} />
          <Button variant="outline" onClick={() => jobs.refetch()}>
            <RotateCw data-icon="inline-start" /> Try again
          </Button>
        </div>
      )}

      {empty && !filtered && (
        <EmptyState
          icon={SquareKanban}
          title="No jobs tracked yet"
          description="Add a job from its link or by hand. Apply on the employer's site, then confirm it here to keep the resume you sent."
          action={
            <Button asChild>
              <Link href="/job-tracker/new">
                <Plus data-icon="inline-start" /> Add job
              </Link>
            </Button>
          }
        />
      )}

      {empty && filtered && (
        <EmptyState
          icon={Search}
          title="No jobs match"
          description="Try another search or clear the filters."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch("")
                setFilters({ status: "", source: "", arrangement: "", sort: filters.sort })
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}

      {jobs.isSuccess && total > 0 && (
        <div className={cn("space-y-4 transition-opacity", jobs.isPlaceholderData && "opacity-60")}>
          {view === "board" ? <Board jobs={items} only={filters.status} /> : <JobTable jobs={items} />}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {items.length} of {total}
            </span>
            {jobs.hasNextPage && (
              <Button variant="outline" size="sm" onClick={() => jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage}>
                {jobs.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Board({ jobs, only }: { jobs: TrackedJob[]; only: string }) {
  const columns = STATUSES.filter((s) => !only || s.id === only)
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {columns.map((s) => {
        const list = jobs.filter((j) => j.status === s.id)
        return (
          <section
            key={s.id}
            aria-label={`${s.name}, ${list.length} jobs`}
            className="flex w-[80vw] max-w-72 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/60 p-2 sm:w-72"
          >
            <header className="flex items-center justify-between px-1.5 pt-1">
              <h2 className="text-xs font-bold tracking-wide uppercase">{s.name}</h2>
              <Badge variant="secondary" className="text-[10px]">
                {list.length}
              </Badge>
            </header>
            {list.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{s.hint}</p>
            ) : (
              list.map((j) => <JobCard key={j.id} job={j} />)
            )}
          </section>
        )
      })}
    </div>
  )
}

function JobCard({ job: j }: { job: TrackedJob }) {
  return (
    <Card className="group relative gap-2 p-3 shadow-xs transition-shadow hover:shadow-md">
      <div className="min-w-0">
        <Link
          href={`/job-tracker/${j.id}`}
          className="block truncate text-sm font-semibold outline-none group-hover:text-primary after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {j.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{j.company}</p>
      </div>
      {(j.location || j.workArrangement !== "unknown") && (
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {[j.location, j.workArrangement !== "unknown" && arrangementName(j.workArrangement)].filter(Boolean).join(" · ")}
        </p>
      )}
      {j.nextAction.text && !j.nextAction.doneAt && (
        <div className="space-y-1">
          <p className="truncate text-xs">{j.nextAction.text}</p>
          <DueBadge action={j.nextAction} />
        </div>
      )}
      {/* Above the card link so it stays clickable. */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-[11px] text-muted-foreground">
          {j.appliedAt ? `Applied ${formatDate(j.appliedAt)}` : `Saved ${formatDate(j.createdAt)}`}
        </span>
        <StatusSelect job={j} className="h-7 text-xs" />
      </div>
    </Card>
  )
}

function JobTable({ jobs }: { jobs: TrackedJob[] }) {
  return (
    <Card className="overflow-hidden p-0 shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted text-left text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5">Job</th>
              <th scope="col" className="px-4 py-2.5">Status</th>
              <th scope="col" className="px-4 py-2.5">Source</th>
              <th scope="col" className="px-4 py-2.5">Arrangement</th>
              <th scope="col" className="px-4 py-2.5">Saved</th>
              <th scope="col" className="px-4 py-2.5">Applied</th>
              <th scope="col" className="px-4 py-2.5">Next action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {jobs.map((j) => (
              <tr key={j.id} className="hover:bg-muted/40">
                <td className="max-w-72 px-4 py-2.5">
                  <Link href={`/job-tracker/${j.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                    {j.title}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{j.company}</span>
                </td>
                <td className="px-4 py-2.5">
                  <StatusSelect job={j} className="h-7 text-xs" />
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{sourceName(j.source) || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{arrangementName(j.workArrangement)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(j.createdAt)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{j.appliedAt ? formatDate(j.appliedAt) : "—"}</td>
                <td className="max-w-64 px-4 py-2.5">
                  {j.nextAction.text ? (
                    <div className="space-y-1">
                      <p className="truncate text-xs">{j.nextAction.text}</p>
                      <DueBadge action={j.nextAction} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

