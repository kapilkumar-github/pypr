import type { Metadata } from "next"

import { TrackerView } from "@/components/tracker/tracker-view"

export const metadata: Metadata = { title: "Job tracker" }

export default function JobTrackerPage() {
  return <TrackerView />
}
