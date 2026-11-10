// Connecting an account: authorization-code flow with PKCE, run through the Pypr website.
// The extension never sees a password. It trades a one-time code for its own session token.

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

export const randomString = (bytes = 32): string => b64url(crypto.getRandomValues(new Uint8Array(bytes)))

export async function challengeFor(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
}

export interface Transaction {
  state: string
  verifier: string
  redirectUri: string
  startedAt: number
}

export const TRANSACTION_TTL_MS = 10 * 60 * 1000

export async function begin(redirectUri: string, now = Date.now()): Promise<{ txn: Transaction; challenge: string }> {
  const txn = { state: randomString(24), verifier: randomString(48), redirectUri, startedAt: now }
  return { txn, challenge: await challengeFor(txn.verifier) }
}

export function authorizeUrl(web: string, txn: Transaction, challenge: string): string {
  const u = new URL("/extension/connect", web)
  u.searchParams.set("state", txn.state)
  u.searchParams.set("challenge", challenge)
  u.searchParams.set("redirect_uri", txn.redirectUri)
  return u.toString()
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export type Callback = { ok: true; code: string } | { ok: false; reason: "denied" | "expired" | "mismatch" | "invalid" }

/** Checks the URL the browser came back with: exact destination, expected state, not expired, a code present. */
export function parseCallback(raw: string | undefined, txn: Transaction | undefined, now = Date.now()): Callback {
  if (!txn) return { ok: false, reason: "invalid" }
  if (now - txn.startedAt > TRANSACTION_TTL_MS) return { ok: false, reason: "expired" }
  let u: URL
  try {
    u = new URL(raw ?? "")
  } catch {
    return { ok: false, reason: "invalid" }
  }
  const want = new URL(txn.redirectUri)
  if (u.origin !== want.origin || u.pathname !== want.pathname) return { ok: false, reason: "mismatch" }
  if (!equal(u.searchParams.get("state") ?? "", txn.state)) return { ok: false, reason: "mismatch" }
  if (u.searchParams.get("error")) return { ok: false, reason: "denied" }
  const code = u.searchParams.get("code") ?? ""
  return code && code.length <= 100 ? { ok: true, code } : { ok: false, reason: "invalid" }
}
