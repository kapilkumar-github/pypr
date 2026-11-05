"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, CircleAlert, CircleCheck, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CHECK_CATEGORIES, runChecks } from "@/lib/resume/checks"
import { matchResume, readPosting, type ResumeMatch } from "@/lib/resume/job-match"
import { resumeOutline } from "@/lib/resume/plain-text"
import type { ResumeData } from "@/lib/resume/types"
import { cn } from "@/lib/utils"

/** Check mode: ATS-readiness score, failing checks, checks by category and job-posting keyword match. */
export function CheckPanel({ data, pages }: { data: ResumeData; pages?: number }) {
  const checks = useMemo(() => runChecks(data, pages), [data, pages])
  const failing = checks.filter((c) => !c.pass)
  const score = Math.round(((checks.length - failing.length) / checks.length) * 100)
  const [posting, setPosting] = useState("")
  const [match, setMatch] = useState<ResumeMatch | null>(null)

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
        <ScoreRing score={score} />
        <div className="min-w-0">
          <p className="font-semibold">{failing.length === 0 ? "Reads cleanly" : score >= 80 ? "Almost there" : "Needs work"}</p>
          <p className="text-xs text-muted-foreground">
            {checks.length - failing.length} of {checks.length} checks pass.
            {failing.length > 0 && ` ${failing.length} to review.`}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Zap className="size-3" /> Live · updates as you edit
          </p>
        </div>
      </div>

      <Tabs defaultValue="issues" className="gap-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="issues">
            Issues <span className="ml-1 rounded bg-muted px-1 text-[10px] tabular-nums">{failing.length}</span>
          </TabsTrigger>
          <TabsTrigger value="match">Job match</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-3">
          {failing.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
              <CircleCheck className="size-4" /> Nothing to fix. Every check passes.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {failing.map((c) => (
                <li key={c.id} className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-sm">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{c.fix}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="px-1 pt-1 text-xs text-muted-foreground">Checks by category</p>
          <div className="divide-y rounded-lg border">
            {CHECK_CATEGORIES.map((cat) => {
              const list = checks.filter((c) => c.category === cat)
              const passed = list.filter((c) => c.pass).length
              return (
                <Collapsible key={cat}>
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm outline-none hover:bg-muted/40 focus-visible:bg-muted/40">
                    {passed === list.length ? <CircleCheck className="size-4 text-success" /> : <CircleAlert className="size-4 text-warning" />}
                    <span className="flex-1 font-medium">{cat}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {passed} of {list.length}
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="space-y-1 px-3 pb-3">
                      {list.map((c) => (
                        <li key={c.id} className="flex items-center gap-2 text-xs">
                          {c.pass ? <CircleCheck className="size-3.5 text-success" /> : <CircleAlert className="size-3.5 text-warning" />}
                          <span className={cn(!c.pass && "font-medium")}>{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            The score counts how reliably software reads your resume. It doesn&apos;t predict whether you&apos;ll be shortlisted. Also
            check the exported PDF.
          </p>
        </TabsContent>

        <TabsContent value="match" className="space-y-3">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-semibold">Match against a job</p>
            <Textarea
              aria-label="Job posting"
              placeholder="Paste a job posting…"
              value={posting}
              maxLength={20000}
              onChange={(e) => setPosting(e.target.value)}
              className="min-h-32 text-xs"
            />
            <Button size="sm" disabled={posting.trim().length < 40} onClick={() => setMatch(matchResume(data, readPosting(posting)))}>
              Match this posting
            </Button>
          </div>
          {match && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">Skills match</p>
                <p className={cn("font-mono text-lg font-bold", match.score >= 60 ? "text-success" : "text-warning")}>{match.score}%</p>
              </div>
              <Terms title={`In your resume (${match.covered.length})`} terms={match.covered.map((r) => r.name)} tone="success" />
              <Terms title={`Missing (${match.missing.length})`} terms={match.missing.map((r) => r.name)} tone="warning" />
              <p className="text-xs text-muted-foreground">
                Skills the posting asks for, found with a built-in list. Add the ones that truly fit your experience, in your own
                words. Match again after changes. To compare all your resumes or use AI, open{" "}
                <Link href="/job-match" className="font-medium text-primary hover:underline">
                  Job match
                </Link>
                .
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Terms({ title, terms, tone }: { title: string; terms: string[]; tone: "success" | "warning" }) {
  if (!terms.length) return null
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1">
        {terms.map((t) => (
          <span
            key={t}
            className={cn("rounded px-1.5 py-0.5 font-mono text-[11px]", tone === "success" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const r = 26
  const len = 2 * Math.PI * r
  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`Score ${score} out of 100`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - score / 100)}
          className={cn("transition-[stroke-dashoffset] duration-500", score >= 80 ? "stroke-success" : "stroke-warning")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold">{score}</span>
    </div>
  )
}

/** What a résumé parser extracts: the plain-text reading order with the fields it would pick out. */
export function ParserView({ data }: { data: ResumeData }) {
  const o = resumeOutline(data)
  const p = data.personalInfo
  const dates = o.sections.flatMap((s) => s.entries.map((e) => e.date)).filter(Boolean).length
  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("break-words", !value && "text-warning")}>{value || "not found"}</dd>
    </div>
  )
  return (
    <div className="mx-auto w-full max-w-[720px] rounded-lg border bg-background p-6 font-mono text-xs leading-relaxed">
      <p className="mb-4 text-muted-foreground">Extracted from the page · reading order · text layer</p>
      <dl className="space-y-1.5">
        {row("Name", o.name)}
        {row("Email", p.email.trim())}
        {row("Phone", p.phone.trim())}
        {row("Location", p.location.trim())}
        {row("Links", o.contacts.filter((c) => c.includes(".") && !c.includes("@")).join(", "))}
        {row("Sections", o.sections.map((s) => s.title).join(", "))}
        {row("Dates", dates ? `${dates} found` : "")}
      </dl>
      {o.sections.map((s) => (
        <div key={s.id} className="mt-5">
          <p className="mb-1.5 text-success">▸ {s.title.toUpperCase()}</p>
          <div className="space-y-2 pl-4 text-muted-foreground">
            {s.entries.map((e, i) => (
              <div key={i}>
                {(e.title || e.subtitle) && (
                  <p className="text-foreground">
                    {[e.title, e.subtitle].filter(Boolean).join(" | ")}
                    {e.date && <span className="text-muted-foreground"> · {e.date}</span>}
                  </p>
                )}
                {e.place && <p>{e.place}</p>}
                {e.lines.map((l, j) => (
                  <p key={j}>{l.bullet ? `- ${l.text}` : l.text}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
