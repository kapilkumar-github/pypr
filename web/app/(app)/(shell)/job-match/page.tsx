import type { Metadata } from "next"

import { JobMatchView } from "@/components/job-match/job-match-view"

export const metadata: Metadata = { title: "Job match" }

export default function JobMatchPage() {
  return <JobMatchView />
}
