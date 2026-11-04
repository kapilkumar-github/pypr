import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { PublicResumeView } from "@/components/resume/public-resume-view"
import { getPublicResume } from "@/lib/server/public-resume"

export async function generateMetadata({ params }: PageProps<"/r/[slug]">): Promise<Metadata> {
  const r = await getPublicResume((await params).slug)
  if (!r) return { title: "Resume not found", robots: { index: false, follow: false } }
  const name = r.data.personalInfo.fullName.trim() || r.title
  return {
    title: `${name} · Resume`,
    description: r.data.personalInfo.jobTitle || undefined,
    robots: r.indexable ? undefined : { index: false, follow: false },
  }
}

async function PublicResume({ params }: { params: PageProps<"/r/[slug]">["params"] }) {
  const { slug } = await params
  const r = await getPublicResume(slug)
  if (!r) notFound()
  return <PublicResumeView slug={slug.toLowerCase()} title={r.title} data={r.data} allowDownload={r.allowDownload} />
}

/** A resume's public web page, at the address its owner chose in Share. */
export default function PublicResumePage({ params }: PageProps<"/r/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-svh bg-canvas" />}>
      <PublicResume params={params} />
    </Suspense>
  )
}
