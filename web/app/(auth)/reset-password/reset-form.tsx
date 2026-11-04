"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { FormAlert } from "@/components/common/form-alert"
import { SubmitButton } from "@/components/common/submit-button"
import { PasswordField } from "@/components/common/password-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { authApi } from "@/lib/api/auth"
import { errorMessage, fieldErrors } from "@/lib/api/client"

export function ResetForm() {
  const router = useRouter()
  const token = useSearchParams().get("token") ?? ""
  const [form, setForm] = useState({ password: "", confirm: "" })
  const [mismatch, setMismatch] = useState(false)
  const reset = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success("Password updated. Log in with your new password.")
      router.replace("/login")
    },
  })

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <FormAlert message="This reset link is missing its token." />
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    )
  }

  const errors = fieldErrors(reset.error)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (form.password !== form.confirm) {
          setMismatch(true)
          return
        }
        setMismatch(false)
        reset.mutate({ token, password: form.password })
      }}
    >
      <FieldGroup>
        <FormAlert message={errorMessage(reset.error)} />
        <PasswordField
          id="password"
          label="New password"
          autoComplete="new-password"
          required
          minLength={8}
          description="At least 8 characters."
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />
        <PasswordField
          id="confirm"
          label="Confirm new password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          error={mismatch ? "Passwords don't match." : undefined}
        />
        <SubmitButton pending={reset.isPending || reset.isSuccess} className="w-full">
          Update password
        </SubmitButton>
        {reset.error && !errors.password && (
          <Link href="/forgot-password" className="text-center text-sm text-primary hover:underline">
            Request a new link
          </Link>
        )}
      </FieldGroup>
    </form>
  )
}
