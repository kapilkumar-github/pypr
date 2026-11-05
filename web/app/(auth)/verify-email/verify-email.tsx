"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { CircleCheck, LoaderCircle } from "lucide-react"

import { FormAlert } from "@/components/common/form-alert"
import { Button } from "@/components/ui/button"
import { authApi } from "@/lib/api/auth"
import { errorMessage } from "@/lib/api/client"

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? ""
  const verify = useMutation({ mutationFn: authApi.verifyEmail })
  const started = useRef(false)

  useEffect(() => {
    // Tokens are single use: send once, even under Strict Mode's double effects.
    if (!token || started.current) return
    started.current = true
    verify.mutate({ token })
  }, [token, verify])

  if (!token || verify.isError) {
    return (
      <div className="space-y-4 text-center">
        <FormAlert message={token ? errorMessage(verify.error) : "This verification link is missing its token."} />
        <p className="text-sm text-muted-foreground">Log in and use “Resend email” to get a new link.</p>
        <Button asChild className="w-full">
          <Link href="/resumes">Go to my resumes</Link>
        </Button>
      </div>
    )
  }
  if (verify.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <p className="flex items-center justify-center gap-2 font-semibold text-success">
          <CircleCheck className="size-5" /> Email verified
        </p>
        <p className="text-sm text-muted-foreground">You can now create and edit resumes.</p>
        <Button asChild className="w-full">
          <Link href="/resumes">Go to my resumes</Link>
        </Button>
      </div>
    )
  }
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-busy="true">
      <LoaderCircle className="size-4 animate-spin" /> Verifying…
    </p>
  )
}
