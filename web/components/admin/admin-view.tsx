"use client"

import { useState, useSyncExternalStore } from "react"
import { Download, Eye, FileText, Globe, LockKeyhole, LogOut, RefreshCw, UserCheck, Users } from "lucide-react"

import { PageHeader } from "@/components/common/page-header"
import { PasswordField } from "@/components/common/password-field"
import { SubmitButton } from "@/components/common/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api/client"
import { useAdminStats, type AdminStats } from "@/lib/api/admin"
import { cn } from "@/lib/utils"

const KEY = "pypr:admin-code"
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb)
  return () => window.removeEventListener("storage", cb)
}

/** Monitoring dashboard. It only holds the code; the backend decides whether it is right. */
export function AdminView() {
  const stored = useSyncExternalStore(subscribe, () => sessionStorage.getItem(KEY) ?? "", () => null)
  const [code, setCode] = useState<string | null>(null)
  if (stored === null) return null // server render: sessionStorage is browser-only
  const active = code ?? stored
  const set = (value: string) => {
    if (value) sessionStorage.setItem(KEY, value)
    else sessionStorage.removeItem(KEY)
    setCode(value)
  }
  return active ? <Dashboard code={active} onCode={set} /> : <CodePrompt onSubmit={set} />
}

function CodePrompt({ onSubmit, error }: { onSubmit: (code: string) => void; error?: string }) {
  const [value, setValue] = useState("")
  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(value)
        }}
        className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-xs"
      >
        <div className="space-y-1">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="size-4" />
          </span>
          <h1 className="pt-2 text-xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Enter the access code to continue.</p>
        </div>
        <PasswordField
          id="admin-code"
          label="Access code"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
        />
        <SubmitButton pending={false} className="w-full" disabled={!value}>
          Continue
        </SubmitButton>
      </form>
    </main>
  )
}

function Dashboard({ code, onCode }: { code: string; onCode: (code: string) => void }) {
  const stats = useAdminStats(code)

  if (stats.error instanceof ApiError && (stats.error.status === 401 || stats.error.status === 429)) {
    // Wrong code (or too many tries): ask again and show what the backend said.
    return <CodePrompt error={stats.error.message} onSubmit={onCode} />
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Monitoring"
        title="Admin"
        description={stats.data ? `Updated ${new Date(stats.data.updatedAt).toLocaleTimeString()}` : "Loading…"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => stats.refetch()} disabled={stats.isFetching}>
              <RefreshCw className={cn(stats.isFetching && "animate-spin")} data-icon="inline-start" />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onCode("")}>
              <LogOut data-icon="inline-start" />
              Lock
            </Button>
          </>
        }
      />
      {stats.isError ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Couldn&apos;t load stats. Try refreshing.</p>
      ) : stats.data ? (
        <Content s={stats.data} />
      ) : (
        <div className="space-y-4" aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      )}
    </main>
  )
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function Content({ s }: { s: AdminStats }) {
  const t = s.totals
  const last = (k: "signups" | "resumes" | "downloads") => sum(s.daily.map((d) => d[k]))
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile icon={<Users />} label="Total users" value={t.users} note={`${last("signups")} in last 30 days`} />
        <Tile icon={<UserCheck />} label="Verified users" value={t.verifiedUsers} note={`${pct(t.verifiedUsers, t.users)}% of users`} />
        <Tile icon={<FileText />} label="Resumes created" value={t.resumes} note={`${last("resumes")} in last 30 days`} />
        <Tile icon={<Download />} label="PDF downloads" value={t.downloads} note={`${last("downloads")} in last 30 days`} />
        <Tile icon={<Globe />} label="Public resumes" value={t.publicResumes} note={`${pct(t.publicResumes, t.resumes)}% of resumes`} />
        <Tile icon={<Eye />} label="Public views" value={t.publicViews} note="all time" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Signups" subtitle="per day, last 30 days" color="var(--chart-1)" data={s.daily.map((d) => ({ date: d.date, value: d.signups }))} />
        <ChartCard title="Resumes created" subtitle="per day, last 30 days" color="var(--chart-2)" data={s.daily.map((d) => ({ date: d.date, value: d.resumes }))} />
        <ChartCard title="PDF downloads" subtitle="per day, last 30 days (tracked since this page launched)" color="var(--chart-3)" data={s.daily.map((d) => ({ date: d.date, value: d.downloads }))} />
        <Recent signups={s.recentSignups} />
      </div>
    </>
  )
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

function Tile({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value.toLocaleString()}</p>
        <p className="truncate text-xs text-muted-foreground">{note}</p>
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, color, data }: { title: string; subtitle: string; color: string; data: { date: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = sum(data.map((d) => d.value))
  const shown = hover === null ? null : data[hover]
  const W = 600
  const H = 160
  const bw = W / data.length
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="secondary" className="tabular-nums">
          {shown ? `${shown.date.slice(5)}: ${shown.value}` : `${total} total`}
        </Badge>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label={`${title} per day`} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={H - f * H} y2={H - f * H} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * (H - 4)
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect x={i * bw + 2} y={H - h} width={bw - 4} height={Math.max(h, d.value ? 2 : 0)} rx={2} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
            </g>
          )
        })}
        <text x={0} y={H + 14} className="fill-muted-foreground text-[10px]">{data[0]?.date.slice(5)}</text>
        <text x={W} y={H + 14} textAnchor="end" className="fill-muted-foreground text-[10px]">{data[data.length - 1]?.date.slice(5)}</text>
        <text x={W} y={10} textAnchor="end" className="fill-muted-foreground text-[10px]">max {max}</text>
      </svg>
    </section>
  )
}

function Recent({ signups }: { signups: AdminStats["recentSignups"] }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <h2 className="text-sm font-bold">Recent signups</h2>
      {signups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users yet.</p>
      ) : (
        <ul className="divide-y">
          {signups.map((u, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {u.verified && <Badge variant="secondary">verified</Badge>}
                <span className="text-xs text-muted-foreground tabular-nums">{new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
