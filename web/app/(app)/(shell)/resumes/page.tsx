import type { Metadata } from "next"

import { ResumeList } from "@/components/resume/resume-list"

export const metadata: Metadata = { title: "Resumes" }

export default function ResumesPage() {
  return <ResumeList />
}
