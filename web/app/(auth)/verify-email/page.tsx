import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthPanel } from "@/components/auth/auth-panel"
import { AuthSwitch } from "@/components/auth/auth-switch"
import { VerifyEmail } from "./verify-email"

export const metadata: Metadata = {
  title: "Verify email",
  robots: { index: false },
}

export default function VerifyEmailPage() {
  return (
    <AuthPanel
      title="Verify your email"
      description="Confirming your address unlocks creating and editing resumes."
      switcher={<AuthSwitch href="/login" label="Log in" />}
    >
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthPanel>
  )
}
