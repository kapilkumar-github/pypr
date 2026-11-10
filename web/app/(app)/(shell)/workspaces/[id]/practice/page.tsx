import type { Metadata } from "next"
import { Suspense } from "react"

import { TestsView } from "@/components/workspace/tests-view"

export const metadata: Metadata = { title: "Practice" }

export default function TestsPage() {
  return (
    <Suspense>
      <TestsView />
    </Suspense>
  )
}
