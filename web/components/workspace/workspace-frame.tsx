"use client"

import { createContext, useContext } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, ChevronsUpDown, Plus, Target } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, errorMessage } from "@/lib/api/client"
import { useWorkspace, useWorkspaces, type Workspace } from "@/lib/api/workspaces"
import { cn } from "@/lib/utils"

const WorkspaceContext = createContext<Workspace | null>(null)

/** The active workspace, for pages inside `/workspaces/[id]`. */
export function useActiveWorkspace(): Workspace {
  const w = useContext(WorkspaceContext)
  if (!w) throw new Error("useActiveWorkspace outside WorkspaceFrame")
  return w
}

/** Header (active workspace, switcher, section tabs) around every workspace page. */
export function WorkspaceFrame({ id, children }: { id: string; children: React.ReactNode }) {
  const workspace = useWorkspace(id)
  const pathname = usePathname()
  const base = `/workspaces/${id}`
  const section = pathname.startsWith(base + "/") ? pathname.slice(base.length + 1).split("/")[0]! : ""

  if (workspace.isPending) return <WorkspaceFrameSkeleton />
  if (workspace.isError) {
    const missing = workspace.error instanceof ApiError && workspace.error.status === 404
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        {missing ? (
          <EmptyState
            icon={Target}
            title="Workspace not found"
            description="It may have been deleted."
            action={
              <Button asChild>
                <Link href="/workspaces">All workspaces</Link>
              </Button>
            }
          />
        ) : (
          <FormAlert message={errorMessage(workspace.error) ?? "Couldn't load this workspace."} />
        )}
      </div>
    )
  }
  const w = workspace.data

  return (
    <WorkspaceContext.Provider value={w}>
      <div className="border-b bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-primary" />
            <Link href="/workspaces" className="hover:text-foreground">
              Workspaces
            </Link>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Switcher current={w} section={section} />
            {w.seniority && <Badge variant="secondary">{w.seniority}</Badge>}
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
    </WorkspaceContext.Provider>
  )
}

/** Switches workspace and keeps the open section. Progress lives on the server, so nothing is lost. */
function Switcher({ current, section }: { current: Workspace; section: string }) {
  const list = useWorkspaces()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="-ml-1.5 flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Active workspace: ${current.name}. Switch workspace`}
        >
          <h1 className="truncate text-2xl font-bold tracking-tight">{current.name}</h1>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        {list.data?.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/workspaces/${w.id}${section ? `/${section}` : ""}`}>
              <Check className={cn(w.id !== current.id && "invisible")} />
              <span className="truncate">{w.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/workspaces/new">
            <Plus /> New workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/workspaces">
            <Target /> All workspaces
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkspaceFrameSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading workspace">
      <div className="border-b bg-card">
        <div className="mx-auto w-full max-w-7xl space-y-3 px-4 py-4 sm:px-6 lg:px-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-80" />
          <Skeleton className="h-8 w-96" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-7xl gap-6 p-4 sm:p-6 lg:grid-cols-3 lg:p-8">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}
