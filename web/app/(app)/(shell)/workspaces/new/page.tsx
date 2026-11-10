import type { Metadata } from "next"
import { Suspense } from "react"

import { CreateWorkspace } from "@/components/workspace/create-workspace"

export const metadata: Metadata = { title: "New workspace" }

export default function NewWorkspacePage() {
  return (
    <Suspense>
      <CreateWorkspace />
    </Suspense>
  )
}
