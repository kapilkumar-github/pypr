"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LoaderCircle, Network, PencilRuler, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { EmptyState } from "@/components/common/empty-state"
import { FormAlert } from "@/components/common/form-alert"
import { useActiveWorkspace } from "@/components/workspace/workspace-frame"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import { boardUrl, useBoards, useCreateBoard, useDeleteBoard } from "@/lib/api/design"
import { promptByKey, PROMPTS } from "./prompts"

const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

/** System design: saved boards and the prompts a new board can start from. */
export function BoardsView() {
  const w = useActiveWorkspace()
  const router = useRouter()
  const verified = useVerified()
  const boards = useBoards(w.id)
  const create = useCreateBoard(w.id)
  const remove = useDeleteBoard(w.id)
  const [creating, setCreating] = useState<string | null>(null)

  const open = (title: string, promptKey?: string) => {
    if (!verified) return verifyFirst()
    setCreating(promptKey ?? "blank")
    create.mutate(
      { title, promptKey },
      {
        onSuccess: (b) => router.push(boardUrl(w.id, b.id)),
        onError: (e) => {
          setCreating(null)
          toast.error(errorMessage(e) ?? "Couldn't create the board.")
        },
      },
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">System design</h2>
          <p className="text-sm text-muted-foreground">Draw architectures on a canvas with load balancers, services, caches, databases and queues, plus plain shapes. Boards save as you work.</p>
        </div>
        <Button onClick={() => open("Untitled board")} disabled={creating !== null}>
          {creating === "blank" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />} Blank board
        </Button>
      </div>

      <section aria-label="Your boards" className="space-y-3">
        <h3 className="text-sm font-semibold">Your boards</h3>
        {boards.isPending ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : boards.isError ? (
          <FormAlert message={errorMessage(boards.error) ?? "Couldn't load your boards."} />
        ) : boards.data.length === 0 ? (
          <EmptyState icon={PencilRuler} title="No boards yet" description="Start from a blank board or pick a requirement below." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boards.data.map((b) => (
              <li key={b.id} className="group relative rounded-xl border bg-card shadow-xs transition-colors hover:border-primary/60">
                <Link href={boardUrl(w.id, b.id)} className="block rounded-xl p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <span className="block truncate font-semibold">{b.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{promptByKey(b.promptKey)?.title ?? "Blank board"}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">Edited {fmt.format(new Date(b.updatedAt))}</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  aria-label={`Delete ${b.title}`}
                  onClick={() => {
                    if (!confirm(`Delete "${b.title}"? This can't be undone.`)) return
                    remove.mutate(b.id, { onError: (e) => toast.error(errorMessage(e) ?? "Couldn't delete the board.") })
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Design requirements" className="space-y-3">
        <h3 className="text-sm font-semibold">Start from a requirement</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROMPTS.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                disabled={creating !== null}
                onClick={() => open(p.title, p.key)}
                className="flex h-full w-full flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
              >
                <span className="flex items-center gap-2 font-semibold">
                  {creating === p.key ? <LoaderCircle className="size-4 animate-spin text-primary" /> : <Network className="size-4 text-primary" />} {p.title}
                </span>
                <span className="text-sm text-muted-foreground">{p.summary}</span>
                <span className="mt-auto pt-1 text-xs text-muted-foreground">{p.checklist.length} things to cover</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
