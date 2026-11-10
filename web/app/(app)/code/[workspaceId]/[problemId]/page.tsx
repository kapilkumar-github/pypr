import type { Metadata } from "next"
import { Suspense } from "react"

import { Playground } from "@/components/code/playground"

export const metadata: Metadata = { title: "Coding practice" }

async function Content({ params }: { params: PageProps<"/code/[workspaceId]/[problemId]">["params"] }) {
  const { workspaceId, problemId } = await params
  return <Playground workspaceId={workspaceId} problemId={problemId} />
}

/** The playground runs full screen, outside the app shell. */
export default function CodePage({ params }: PageProps<"/code/[workspaceId]/[problemId]">) {
  return (
    <Suspense fallback={<div className="h-svh bg-background" />}>
      <Content params={params} />
    </Suspense>
  )
}
