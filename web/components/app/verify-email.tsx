"use client"

import { useMutation } from "@tanstack/react-query"
import { MailWarning } from "lucide-react"
import { toast } from "sonner"

import { useUser } from "@/components/app/user-context"
import { Button } from "@/components/ui/button"
import { authApi } from "@/lib/api/auth"
import { errorMessage } from "@/lib/api/client"

/** Creating and editing need a verified email (the API enforces it too). */
export function useVerified() {
  return useUser().emailVerified
}

export const verifyFirst = () => toast.error("Verify your email first. Check your inbox for the link.")

/** Shown across the app until the email is verified. */
export function VerifyEmailBanner() {
  const user = useUser()
  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.success(`Sent. Check ${user.email}.`),
    onError: (err) => toast.error(errorMessage(err) ?? "Couldn't send the email. Try again."),
  })
  if (user.emailVerified) return null
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm"
      data-print="hide"
    >
      <MailWarning className="size-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Verify your email to create and edit resumes.</span>{" "}
        <span className="text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{user.email}</span>.
        </span>
      </p>
      <Button size="sm" variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>
        {resend.isPending ? "Sending…" : "Resend email"}
      </Button>
    </div>
  )
}
