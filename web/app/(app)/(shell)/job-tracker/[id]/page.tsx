import type { Metadata } from "next"
import { Suspense } from "react"

import { JobDetail } from "@/components/tracker/job-detail"

export const metadata: Metadata = { title: "Job" }

export default function JobPage() {
  return (
    <Suspense>
      <JobDetail />
    </Suspense>
  )
}
