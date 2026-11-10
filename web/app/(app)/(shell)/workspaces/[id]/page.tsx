import type { Metadata } from "next"
import { Suspense } from "react"

import { WorkspaceOverview } from "@/components/workspace/workspace-overview"

export const metadata: Metadata = { title: "Workspace" }

export default function WorkspacePage() {
  return (
    <Suspense>
      <WorkspaceOverview />
    </Suspense>
  )
}
