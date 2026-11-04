"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [client] = useState(() => {
    // Session expired mid-use: send the user back to log in, then return them here.
    const onError = (error: unknown) => {
      if (error instanceof ApiError && error.code === "unauthenticated") {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`)
      }
    }
    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
        },
      },
    })
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
