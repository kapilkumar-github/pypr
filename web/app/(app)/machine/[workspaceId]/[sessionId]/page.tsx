import type { Metadata } from "next"
import { Suspense } from "react"

import { MachinePlayground } from "@/components/machine/machine-playground"

export const metadata: Metadata = { title: "Machine coding" }

async function Content({ params }: { params: PageProps<"/machine/[workspaceId]/[sessionId]">["params"] }) {
  const { workspaceId, sessionId } = await params
  return <MachinePlayground workspaceId={workspaceId} sessionId={sessionId} />
}

/** Runs full screen, outside the app shell. */
export default function MachinePage({ params }: PageProps<"/machine/[workspaceId]/[sessionId]">) {
  return (
    <Suspense fallback={<div className="h-svh bg-background" />}>
      <Content params={params} />
    </Suspense>
  )
}
