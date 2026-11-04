import type { Metadata } from "next"
import Link from "next/link"

import { AuthPanel } from "@/components/auth/auth-panel"
import { AuthSwitch } from "@/components/auth/auth-switch"
import { ForgotForm } from "./forgot-form"

export const metadata: Metadata = { title: "Forgot password" }

export default function ForgotPasswordPage() {
  return (
    <AuthPanel
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
      switcher={<AuthSwitch prompt="Remembered it?" href="/login" label="Log in" />}
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <ForgotForm />
    </AuthPanel>
  )
}
