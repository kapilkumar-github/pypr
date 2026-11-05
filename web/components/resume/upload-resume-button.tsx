"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Upload } from "lucide-react"
import { toast } from "sonner"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { Button } from "@/components/ui/button"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { parseResumeFile, UPLOAD_ACCEPT, useCreateResume } from "@/lib/api/resumes"
import { resumeFromParsed } from "@/lib/resume/import"

/**
 * Upload a PDF, Word or text resume: the API extracts it with AI, we create a resume from the
 * result and open it in the builder for review.
 */
export function UploadResumeButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const create = useCreateResume()
  const verified = useVerified()

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    const toastId = toast.loading(`Reading ${file.name}…`, { description: "This can take up to a minute." })
    try {
      const parsed = await parseResumeFile(file)
      const resume = await create.mutateAsync(resumeFromParsed(parsed, file.name))
      toast.success("Resume imported. Check the details before you send it.", { id: toastId, description: undefined })
      router.push(`/resumes/${resume.id}`)
    } catch (err) {
      const message = fieldErrors(err).file ?? errorMessage(err) ?? "Couldn't import that file."
      toast.error(message, { id: toastId, description: undefined })
      setBusy(false)
    } finally {
      if (input.current) input.current.value = ""
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => (verified ? input.current?.click() : verifyFirst())} disabled={busy} aria-busy={busy}>
        {busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}
        {busy ? "Reading…" : "Upload resume"}
      </Button>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Resume file (PDF, Word or text)"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
    </>
  )
}
