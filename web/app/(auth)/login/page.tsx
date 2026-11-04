import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthPanel } from "@/components/auth/auth-panel"
import { AuthSwitch } from "@/components/auth/auth-switch"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Log in" }

export default function LoginPage() {
  return (
    <AuthPanel
      title="Welcome back"
      description="Enter your details to log in to pypr."
      switcher={<AuthSwitch prompt="Don't have an account?" href="/signup" label="Sign up" />}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthPanel>
  )
}
