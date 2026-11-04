import type { Metadata } from "next"
import { Suspense } from "react"

import { ResumeBuilder, ResumeBuilderSkeleton } from "@/components/resume/builder/resume-builder"

export const metadata: Metadata = { title: "Edit resume" }

async function Builder({ params }: { params: PageProps<"/resumes/[id]">["params"] }) {
  const { id } = await params
  return <ResumeBuilder id={id} />
}

/** Full-screen editor: no sidebar, its own toolbars. */
export default function ResumeBuilderPage({ params }: PageProps<"/resumes/[id]">) {
  return (
    <div className="flex h-svh flex-col" data-print="reset">
      <Suspense fallback={<ResumeBuilderSkeleton />}>
        <Builder params={params} />
      </Suspense>
    </div>
  )
}
