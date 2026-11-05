"use client"

import { useMemo, useState } from "react"
import { ArrowRight, FileText, LayoutGrid, List, Plus, RotateCw, Search } from "lucide-react"

import { useUser } from "@/components/app/user-context"
import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { PageHeader } from "@/components/common/page-header"
import { CreateResumeDialog } from "@/components/resume/create-resume-dialog"
import { ResumeCard, type ResumeLayout } from "@/components/resume/resume-card"
import { UploadResumeButton } from "@/components/resume/upload-resume-button"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import { useResumes, type ResumeSummary } from "@/lib/api/resumes"
import { TEMPLATES } from "@/lib/resume/types"
import { cn } from "@/lib/utils"

function CreateCard() {
  return (
    <CreateResumeDialog
      trigger={
        <button
          type="button"
          className="group flex min-h-[26rem] flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card p-6 text-center transition-colors outline-none hover:border-primary hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xs transition-all group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground">
            <Plus className="size-6" />
          </span>
          <span className="mt-4 text-lg font-semibold">Create new resume</span>
          <span className="mt-1 max-w-xs text-sm text-muted-foreground">
            Start blank or from a Software Engineer example.
          </span>
          <span className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary group-hover:underline">
            Get started <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </button>
      }
    />
  )
}

function Toolbar({
  resumes,
  template,
  setTemplate,
  query,
  setQuery,
  layout,
  setLayout,
}: {
  resumes: ResumeSummary[]
  template: string
  setTemplate: (t: string) => void
  query: string
  setQuery: (q: string) => void
  layout: ResumeLayout
  setLayout: (l: ResumeLayout) => void
}) {
  const filters = [
    { id: "all", name: "All resumes", count: resumes.length },
    ...TEMPLATES.map((t) => ({ id: t.id, name: t.name, count: resumes.filter((r) => r.template === t.id).length })),
  ]
  return (
    <Card className="flex-col gap-2 p-2 shadow-xs md:flex-row md:items-center md:justify-between">
      <div role="group" aria-label="Filter by template" className="flex flex-wrap items-center gap-1">
        {filters.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={template === f.id ? "default" : "ghost"}
            aria-pressed={template === f.id}
            onClick={() => setTemplate(f.id)}
            className={cn(template !== f.id && "text-muted-foreground")}
          >
            {f.name} ({f.count})
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-full md:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title or role…"
            aria-label="Filter resumes"
            className="h-8 border-transparent bg-muted pl-8 focus-visible:bg-card"
          />
        </div>
        <span className="h-6 w-px bg-border" />
        <div role="group" aria-label="Layout" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {(
            [
              ["grid", LayoutGrid, "Grid view"],
              ["list", List, "List view"],
            ] as const
          ).map(([id, Icon, label]) => (
            <Button
              key={id}
              size="icon-xs"
              variant="ghost"
              aria-label={label}
              aria-pressed={layout === id}
              onClick={() => setLayout(id)}
              className={cn(layout === id && "bg-card text-primary shadow-xs hover:bg-card")}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </div>
    </Card>
  )
}

export function ResumeList() {
  const user = useUser()
  const resumes = useResumes()
  const [template, setTemplate] = useState("all")
  const [query, setQuery] = useState("")
  const [layout, setLayout] = useState<ResumeLayout>("grid")

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (resumes.data ?? []).filter(
      (r) =>
        (template === "all" || r.template === template) &&
        (!q || r.title.toLowerCase().includes(q) || r.jobTitle.toLowerCase().includes(q)),
    )
  }, [resumes.data, template, query])

  const hasResumes = !!resumes.data?.length
  const filtering = template !== "all" || query.trim() !== ""

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow={
          <>
            Workspace <span className="text-border">/</span> {user.name}
          </>
        }
        title="Resumes"
        description="Keep a tailored resume for each kind of role you apply to."
        actions={
          hasResumes ? (
            <div className="flex flex-wrap gap-2">
              <UploadResumeButton />
              <CreateResumeDialog />
            </div>
          ) : undefined
        }
      />

      {resumes.isPending && (
        <div className="space-y-6" aria-busy="true" aria-label="Loading resumes">
          <Skeleton className="h-12 rounded-xl" />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[26rem] rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {resumes.isError && (
        <div className="space-y-3">
          <FormAlert message={errorMessage(resumes.error) ?? "Couldn't load your resumes."} />
          <Button variant="outline" onClick={() => resumes.refetch()}>
            <RotateCw data-icon="inline-start" /> Try again
          </Button>
        </div>
      )}

      {resumes.data?.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          description="Create your first resume. Start blank, from a Software Engineer example, or upload the one you have."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <CreateResumeDialog
                trigger={
                  <Button>
                    <Plus data-icon="inline-start" /> Create resume
                  </Button>
                }
              />
              <UploadResumeButton />
            </div>
          }
        />
      )}

      {hasResumes && (
        <>
          <Toolbar
            resumes={resumes.data!}
            template={template}
            setTemplate={setTemplate}
            query={query}
            setQuery={setQuery}
            layout={layout}
            setLayout={setLayout}
          />

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No resumes match these filters.{" "}
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => {
                  setTemplate("all")
                  setQuery("")
                }}
              >
                Clear filters
              </button>
            </div>
          ) : layout === "grid" ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {!filtering && <CreateCard />}
              {visible.map((r) => (
                <ResumeCard key={r.id} resume={r} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((r) => (
                <ResumeCard key={r.id} resume={r} layout="list" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
