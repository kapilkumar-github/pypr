import type { Metadata } from "next"
import { Suspense } from "react"

import { DesignCanvas } from "@/components/design/canvas"

export const metadata: Metadata = { title: "System design board" }

async function Content({ params }: { params: PageProps<"/design/[workspaceId]/[boardId]">["params"] }) {
  const { workspaceId, boardId } = await params
  return <DesignCanvas workspaceId={workspaceId} boardId={boardId} />
}

/** The canvas runs full screen, outside the app shell. */
export default function DesignBoardPage({ params }: PageProps<"/design/[workspaceId]/[boardId]">) {
  return (
    <Suspense fallback={<div className="h-svh bg-background" />}>
      <Content params={params} />
    </Suspense>
  )
}
