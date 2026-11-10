import type { Metadata } from "next"

import { AddJob } from "@/components/tracker/add-job"

export const metadata: Metadata = { title: "Add job" }

export default function AddJobPage() {
  return <AddJob />
}
