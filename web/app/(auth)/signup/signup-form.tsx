"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"

import { FormAlert } from "@/components/common/form-alert"
import { SubmitButton } from "@/components/common/submit-button"
import { PasswordField } from "@/components/common/password-field"
import { TextField } from "@/components/common/text-field"
import { FieldGroup } from "@/components/ui/field"
import { authApi } from "@/lib/api/auth"
import { errorMessage, fieldErrors } from "@/lib/api/client"

export function SignupForm() {
  const router = useRouter()
  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const signup = useMutation({ mutationFn: authApi.signup, onSuccess: () => router.replace("/resumes") })
  const errors = fieldErrors(signup.error)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        signup.mutate(form)
      }}
    >
      <FieldGroup>
        <FormAlert message={errorMessage(signup.error)} />
        <TextField
          id="name"
          label="Full name"
          autoComplete="name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          required
          minLength={8}
          description="At least 8 characters."
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />
        <SubmitButton pending={signup.isPending || signup.isSuccess} className="w-full">
          Create account <ArrowRight data-icon="inline-end" />
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}
