import type { Metadata } from "next"

import { AuthPanel } from "@/components/auth/auth-panel"
import { AuthSwitch } from "@/components/auth/auth-switch"
import { SignupForm } from "./signup-form"

export const metadata: Metadata = { title: "Create account" }

export default function SignupPage() {
  return (
    <AuthPanel
      title="Create your account"
      description="Start with a resume, then prepare for the interview."
      switcher={<AuthSwitch prompt="Already have an account?" href="/login" label="Log in" />}
    >
      <SignupForm />
    </AuthPanel>
  )
}
