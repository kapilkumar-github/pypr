import type { Metadata } from "next"
import { Suspense } from "react"

import { ConnectExtension } from "./connect"

export const metadata: Metadata = { title: "Connect the Pypr extension", robots: { index: false } }

export default function Page() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      <Suspense>
        <ConnectExtension />
      </Suspense>
    </main>
  )
}
