"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"

import { FormAlert } from "@/components/common/form-alert"
import { SubmitButton } from "@/components/common/submit-button"
import { PasswordField } from "@/components/common/password-field"
import { TextField } from "@/components/common/text-field"
import { FieldGroup } from "@/components/ui/field"
import { authApi, safeNext } from "@/lib/api/auth"
import { errorMessage, fieldErrors } from "@/lib/api/client"

export function LoginForm() {
  const router = useRouter()
  const next = safeNext(useSearchParams().get("next"))
  const [form, setForm] = useState({ email: "", password: "" })
  const login = useMutation({ mutationFn: authApi.login, onSuccess: () => router.replace(next) })
  const errors = fieldErrors(login.error)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        login.mutate(form)
      }}
    >
      <FieldGroup>
        <FormAlert message={errorMessage(login.error)} />
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
          label={
            <span className="flex w-full items-center justify-between">
              Password
              <Link href="/forgot-password" className="text-xs font-normal text-primary hover:underline">
                Forgot password?
              </Link>
            </span>
          }
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />
        <SubmitButton pending={login.isPending || login.isSuccess} className="w-full">
          Log in <ArrowRight data-icon="inline-end" />
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}
