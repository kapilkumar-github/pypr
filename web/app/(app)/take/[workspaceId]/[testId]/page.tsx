import type { Metadata } from "next"
import { Suspense } from "react"

import { TestRunner } from "@/components/workspace/test-runner"

export const metadata: Metadata = { title: "Test" }

async function Runner({ params }: { params: PageProps<"/take/[workspaceId]/[testId]">["params"] }) {
  const { workspaceId, testId } = await params
  return <TestRunner workspaceId={workspaceId} testId={testId} />
}

/** A test runs in its own tab without the app shell: no navigation to wander off to. */
export default function TakeTestPage({ params }: PageProps<"/take/[workspaceId]/[testId]">) {
  return (
    <Suspense fallback={<div className="h-svh bg-background" />}>
      <Runner params={params} />
    </Suspense>
  )
}
