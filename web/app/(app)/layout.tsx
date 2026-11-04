import { Suspense } from "react"
import { redirect } from "next/navigation"

import { UserProvider } from "@/components/app/user-context"
import { getCurrentUser } from "@/lib/server/session"

async function Authenticated({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return <UserProvider user={user}>{children}</UserProvider>
}

/** Every signed-in page: validates the session. Pages with navigation add the `(shell)` layout. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="h-svh bg-background" />}>
      <Authenticated>{children}</Authenticated>
    </Suspense>
  )
}
