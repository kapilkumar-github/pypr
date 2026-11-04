import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthPanel } from "@/components/auth/auth-panel"
import { AuthSwitch } from "@/components/auth/auth-switch"
import { ResetForm } from "./reset-form"

export const metadata: Metadata = { title: "Reset password" }

export default function ResetPasswordPage() {
  return (
    <AuthPanel
      title="Choose a new password"
      description="You'll be signed out of other devices."
      switcher={<AuthSwitch href="/login" label="Log in" />}
    >
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthPanel>
  )
}
