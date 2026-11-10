"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { api, ApiError } from "@/lib/api/client"

// The extension sends the browser here with state, a PKCE challenge and its redirect URI. Only the exact
// https://<id>.chromiumapp.org/pypr callback shape is followed; the API re-checks the extension ID.
const REDIRECT = /^https:\/\/[a-p]{32}\.chromiumapp\.org\/pypr$/
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/
const STATE = /^[A-Za-z0-9_-]{16,128}$/
const KEY = "pypr-extension-connect"

type Request = { state: string; challenge: string; redirectUri: string }

function fromParams(p: URLSearchParams): Request | null {
  const state = p.get("state") ?? "", challenge = p.get("challenge") ?? "", redirectUri = p.get("redirect_uri") ?? ""
  return STATE.test(state) && CHALLENGE.test(challenge) && REDIRECT.test(redirectUri) ? { state, challenge, redirectUri } : null
}

export function ConnectExtension() {
  const params = useSearchParams()
  const [req, setReq] = useState<Request | null | undefined>(undefined)
  const [user, setUser] = useState<{ name: string; email: string } | null | undefined>(undefined)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  // The login page keeps only the path, so the request waits in sessionStorage while the user signs in.
  useEffect(() => {
    let r = fromParams(params)
    try {
      if (r) sessionStorage.setItem(KEY, JSON.stringify(r))
      else {
        const saved = sessionStorage.getItem(KEY)
        r = saved ? restore(saved) : null
      }
    } catch { /* storage blocked: only the URL works */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReq(r)
  }, [params])

  useEffect(() => {
    api<{ name: string; email: string }>("/auth/me").then(setUser, () => setUser(null))
  }, [])

  async function approve() {
    if (!req) return
    setBusy(true)
    setError("")
    try {
      const { code } = await api<{ code: string }>("/ext/authorize", "POST", req)
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
      const back = new URL(req.redirectUri)
      back.searchParams.set("code", code)
      back.searchParams.set("state", req.state)
      window.location.assign(back.toString())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't connect. Try again from the extension.")
      setBusy(false)
    }
  }

  function cancel() {
    if (!req) return
    try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    const back = new URL(req.redirectUri)
    back.searchParams.set("error", "access_denied")
    back.searchParams.set("state", req.state)
    window.location.assign(back.toString())
  }

  if (req === undefined || user === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!req) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Connect the Pypr extension</h1>
        <p className="text-sm text-muted-foreground">This link isn&apos;t valid. Open the extension and choose Connect to start again.</p>
      </div>
    )
  }
  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Sign in to connect the extension</h1>
        <p className="text-sm text-muted-foreground">Sign in to Pypr, then you&apos;ll come back here to approve the connection.</p>
        <Button asChild><Link href="/login?next=/extension/connect">Sign in</Link></Button>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Connect the Pypr extension?</h1>
      <p className="text-sm text-muted-foreground">
        The extension will be able to save jobs to the tracker of <strong className="text-foreground">{user.name}</strong> ({user.email}). It never sees your password. You can disconnect any time from the extension.
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={approve} disabled={busy}>{busy ? "Connecting…" : "Connect"}</Button>
        <Button variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  )
}

function restore(saved: string): Request | null {
  try {
    const r = JSON.parse(saved) as Request
    return STATE.test(r.state) && CHALLENGE.test(r.challenge) && REDIRECT.test(r.redirectUri) ? r : null
  } catch {
    return null
  }
}
