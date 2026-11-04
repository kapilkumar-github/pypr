import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { PdfReady } from "@/components/resume/document/pdf-ready"
import { ResumeDocument } from "@/components/resume/document/resume-document"
import { pageRule } from "@/lib/resume/print"
import { getRenderResume } from "@/lib/server/render-resume"

export const metadata: Metadata = { title: "Resume", robots: { index: false, follow: false } }

async function PrintResume({ params, searchParams }: PageProps<"/print/[id]">) {
  const [{ id }, { token }] = await Promise.all([params, searchParams])
  const r = await getRenderResume(id, typeof token === "string" ? token : "")
  if (!r) notFound()
  return (
    <>
      <style>{pageRule(r.data.settings)}</style>
      <ResumeDocument data={r.data} />
      <PdfReady />
    </>
  )
}

/**
 * The page the API's headless Chrome prints to PDF. Opened only with a short-lived token;
 * the print stylesheet strips the on-screen paper chrome and @page sets size and margins.
 */
export default function PrintPage(props: PageProps<"/print/[id]">) {
  return (
    <Suspense>
      <PrintResume {...props} />
    </Suspense>
  )
}
