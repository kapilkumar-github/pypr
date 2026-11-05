import Link from "next/link"
import {
  ArrowRight,
  BotMessageSquare,
  Check,
  CloudCheck,
  Eye,
  FileText,
  GraduationCap,
  SquareKanban,
  type LucideIcon,
} from "lucide-react"

import { FloatingIcons } from "@/components/brand/floating-icons"
import { BuiltBy } from "@/components/brand/built-by"
import { Logo } from "@/components/brand/logo"
import { IconTile } from "@/components/common/icon-tile"
import { Metric, ResumeMock, type ResumeMockData } from "@/components/landing/resume-mock"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const engineer: ResumeMockData = {
  format: "Engineering format",
  name: "Alex Vance",
  role: "Staff Systems Engineer",
  contact: "Seattle, WA • alex.vance@example.com",
  summaryLabel: "Summary",
  summary: "Infrastructure engineer with 9+ years building high-throughput distributed systems on multi-region Kubernetes.",
  experienceLabel: "Experience",
  jobs: [
    {
      title: "Principal Systems Architect",
      company: "Apex Cloud Systems",
      dates: "2022 — Present",
      bullets: [
        <>Cut p99 API latency by <Metric>38%</Metric> with a Go gRPC rewrite.</>,
        <>Designed multi-region failover saving <Metric>$380k</Metric> a year.</>,
      ],
    },
    { title: "Senior Distributed Systems Dev", company: "ScaleNode Inc.", dates: "2019 — 2022" },
  ],
  skillsLabel: "Skills",
  skills: ["Distributed Systems", "Go / Rust", "Kubernetes", "System Design"],
}

const featured: ResumeMockData = {
  format: "Modern template",
  name: "Elena Rostova",
  role: "Senior Software Engineer",
  contact: "San Francisco, CA • elena.rostova@example.com",
  summaryLabel: "Professional summary",
  summary:
    "Full stack engineer with 8 years shipping product at scale. Led platform rewrites that doubled release velocity and cut infrastructure cost by a third.",
  experienceLabel: "Experience",
  jobs: [
    {
      title: "Senior Software Engineer",
      company: "CloudScale • San Francisco, CA",
      dates: "2021 — Present",
      bullets: [
        <>Grew checkout conversion <Metric>+14%</Metric> by rebuilding the payments flow in React and Go.</>,
        <>Led a team of <Metric>6 engineers</Metric> migrating 40 services to Kubernetes with zero downtime.</>,
      ],
    },
    { title: "Software Engineer", company: "FinVenture • New York, NY", dates: "2017 — 2021" },
  ],
  skillsLabel: "Skills",
  skills: ["TypeScript", "React", "Go", "PostgreSQL", "AWS"],
}

const operations: ResumeMockData = {
  format: "Classic template",
  name: "Marcus Chen",
  role: "Engineering Manager",
  contact: "Austin, TX • marcus.chen@example.com",
  summaryLabel: "Summary",
  summary: "Engineering leader focused on developer productivity, platform reliability and growing high-trust teams.",
  experienceLabel: "Experience",
  jobs: [
    {
      title: "Engineering Manager, Platform",
      company: "HyperScale Labs",
      dates: "2020 — Present",
      bullets: [
        <>Cut deploy time from 45 to <Metric>6 minutes</Metric>.</>,
        <>Grew the platform team from 4 to <Metric>14</Metric>.</>,
      ],
    },
    { title: "Tech Lead", company: "Vanguard Dynamics", dates: "2017 — 2020" },
  ],
  skillsLabel: "Skills",
  skills: ["Platform", "CI/CD", "Hiring", "Observability"],
}

const highlights = ["Free to start", "ATS-friendly templates", "Light and dark themes"]

const features: { icon: LucideIcon; title: string; description: string; soon?: boolean }[] = [
  {
    icon: FileText,
    title: "Resume builder",
    description: "Clean templates, rich text bullets, a live preview and one-click PDF export.",
  },
  {
    icon: GraduationCap,
    title: "Interview prep",
    description: "Study material tailored to your profession. Starting with Software Engineer.",
  },
  {
    icon: BotMessageSquare,
    title: "AI mock interview",
    description: "Practice realistic interviews and get structured feedback on every answer.",
    soon: true,
  },
  {
    icon: SquareKanban,
    title: "Job tracker",
    description: "Keep every application, contact and deadline on one board.",
    soon: true,
  },
]

const professions = [
  { name: "Software Engineer", live: true },
  { name: "Product Manager" },
  { name: "Data Scientist" },
  { name: "Designer" },
  { name: "Engineering Manager" },
]

function FloatingChip({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string
  className: string
}) {
  return (
    <div
      aria-hidden
      className={`absolute z-30 hidden items-center gap-2.5 rounded-xl border bg-card px-4 py-2.5 shadow-xl transition-transform hover:rotate-0 lg:flex ${className}`}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </span>
      <span className="text-left">
        <span className="block text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{label}</span>
        <span className="block text-xs font-bold">{value}</span>
      </span>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col bg-paper">
      <FloatingIcons />
      <header className="sticky top-0 z-50 border-b bg-card/80 shadow-xs backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6 lg:px-12">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="rounded-full px-4">
              <Link href="/signup">Build my resume</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <section className="mx-auto flex max-w-7xl flex-col items-center px-6 pt-14 pb-24 text-center lg:px-12 lg:pt-20">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-1.5 shadow-xs">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            <span className="text-xs font-bold text-accent-foreground">Resume builder + interview prep</span>
          </div>

          <h1 className="mb-6 max-w-5xl text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-5xl">
            Your career.{" "}
            <span className="bg-linear-to-r from-brand-from to-brand-to bg-clip-text text-transparent">
              Documented beautifully.
            </span>
          </h1>
          <p className="mb-10 max-w-2xl text-base leading-relaxed text-muted-foreground">
            A focused resume builder made for recruiter screens, with interview prep tailored to your profession.
          </p>

          <div className="mb-5 flex w-full max-w-md flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row">
            <Button size="lg" asChild className="h-11 w-full rounded-full px-8 shadow-lg shadow-primary/25 sm:w-auto">
              <Link href="/signup">
                Build resume <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-11 w-full rounded-full px-7 sm:w-auto">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>

          <ul className="mb-16 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-success" /> {h}
              </li>
            ))}
          </ul>

          <div className="relative flex min-h-[640px] w-full max-w-6xl items-end justify-center pt-6 pb-4">
            <FloatingChip icon={Eye} label="Live preview" value="See every edit instantly" className="top-12 left-4 -rotate-3 xl:left-8" />
            <FloatingChip icon={CloudCheck} label="Autosave" value="Saved as you type" className="top-16 right-4 rotate-3 xl:right-8" />

            <div className="relative flex w-full items-end justify-center">
              <ResumeMock
                data={engineer}
                accent="#4f46e5"
                className="z-10 hidden min-h-[580px] -mr-24 -rotate-2 -skew-y-2 opacity-95 transition-transform duration-300 hover:-translate-y-2 hover:rotate-0 hover:skew-y-0 md:flex lg:-mr-28"
              />
              <ResumeMock
                data={featured}
                accent="#4f46e5"
                featured
                className="relative z-20 min-h-[620px] scale-105 transition-transform duration-300 hover:-translate-y-2 hover:scale-[1.07]"
              />
              <ResumeMock
                data={operations}
                accent="#0d9488"
                className="z-10 hidden min-h-[580px] -ml-24 rotate-2 skew-y-2 opacity-95 transition-transform duration-300 hover:-translate-y-2 hover:rotate-0 hover:skew-y-0 md:flex lg:-ml-28"
              />
            </div>
          </div>

          <div className="flex w-full max-w-4xl flex-col items-center pt-12">
            <p className="mb-5 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Interview prep tailored to your profession
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {professions.map((p) => (
                <li key={p.name}>
                  <Badge
                    variant={p.live ? "default" : "outline"}
                    className={p.live ? "h-7 px-3" : "h-7 px-3 text-muted-foreground"}
                  >
                    {p.name}
                    {!p.live && <span className="text-[10px] font-normal">· soon</span>}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4 lg:px-12">
          {features.map((f) => (
            <Card key={f.title} className="shadow-xs">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <IconTile icon={f.icon} />
                  {f.soon && <Badge variant="secondary">Coming soon</Badge>}
                </div>
                <CardTitle>{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{f.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row lg:px-12">
          <Logo size="sm" />
          <div className="flex flex-col items-center gap-1 sm:items-end">
            <span className="text-xs text-muted-foreground">© pypr. Career tools for job seekers.</span>
            <BuiltBy />
          </div>
        </div>
      </footer>
    </div>
  )
}
