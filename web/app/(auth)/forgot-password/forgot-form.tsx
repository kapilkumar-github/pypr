"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { MailCheck } from "lucide-react"

import { FormAlert } from "@/components/common/form-alert"
import { IconTile } from "@/components/common/icon-tile"
import { SubmitButton } from "@/components/common/submit-button"
import { TextField } from "@/components/common/text-field"
import { FieldGroup } from "@/components/ui/field"
import { authApi } from "@/lib/api/auth"
import { errorMessage, fieldErrors } from "@/lib/api/client"

export function ForgotForm() {
  const [email, setEmail] = useState("")
  const request = useMutation({ mutationFn: authApi.forgotPassword })

  if (request.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <IconTile icon={MailCheck} />
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>, we&apos;ve sent a link
          to reset your password. It expires in 1 hour.
        </p>
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        request.mutate({ email })
      }}
    >
      <FieldGroup>
        <FormAlert message={errorMessage(request.error)} />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors(request.error).email}
        />
        <SubmitButton pending={request.isPending} className="w-full">
          Send reset link
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}
