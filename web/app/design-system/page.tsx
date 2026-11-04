import type { Metadata } from "next"
import { Briefcase, FileText, Inbox, Plus, Trash2 } from "lucide-react"

import { Logo } from "@/components/brand/logo"
import { EmptyState } from "@/components/common/empty-state"
import { IconTile } from "@/components/common/icon-tile"
import { PageHeader } from "@/components/common/page-header"
import { SectionCard } from "@/components/common/section-card"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { RichTextDemo } from "./rich-text-demo"

export const metadata: Metadata = { title: "Design system" }

const swatches = [
  "background",
  "card",
  "primary",
  "secondary",
  "muted",
  "accent",
  "destructive",
  "success",
  "warning",
  "border",
  "input",
  "ring",
] as const

const swatchClass: Record<(typeof swatches)[number], string> = {
  background: "bg-background",
  card: "bg-card",
  primary: "bg-primary",
  secondary: "bg-secondary",
  muted: "bg-muted",
  accent: "bg-accent",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
  border: "bg-border",
  input: "bg-input",
  ring: "bg-ring",
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>

      <PageHeader
        title="Design system"
        description="Tokens and reusable components. Toggle the theme to check both modes."
        actions={<Button>Primary action</Button>}
      />

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {swatches.map((s) => (
            <div key={s} className="space-y-1.5">
              <div className={`h-12 rounded-lg border ${swatchClass[s]}`} />
              <p className="font-mono text-[11px] text-muted-foreground">{s}</p>
            </div>
          ))}
        </div>
        <div className="h-12 rounded-lg bg-linear-to-r from-brand-from to-brand-to" />
      </Section>

      <Section title="Typography">
        <div className="space-y-2">
          <p className="text-4xl font-extrabold tracking-tight">Display / 4xl extrabold</p>
          <p className="text-2xl font-bold tracking-tight">Page title / 2xl bold</p>
          <p className="text-lg font-bold">Dialog title / lg bold</p>
          <p className="text-sm font-semibold">Card title / sm semibold</p>
          <p className="text-sm">Body / sm regular</p>
          <p className="text-xs text-muted-foreground">Caption / xs muted</p>
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Overline / 11px</p>
          <p className="font-mono text-xs">Mono / JetBrains Mono</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">
            <Trash2 data-icon="inline-start" /> Delete
          </Button>
          <Button variant="link">Link</Button>
          <Button size="sm">
            <Plus data-icon="inline-start" /> Small
          </Button>
          <Button size="icon" variant="outline" aria-label="Add">
            <Plus />
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges & icon tiles">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <IconTile icon={FileText} />
        </div>
      </Section>

      <Section title="Form fields">
        <Card className="max-w-md">
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ds-email">Email</FieldLabel>
                <Input id="ds-email" type="email" placeholder="you@example.com" />
                <FieldDescription>We never share your email.</FieldDescription>
              </Field>
              <Field data-invalid>
                <FieldLabel htmlFor="ds-password">Password</FieldLabel>
                <Input id="ds-password" type="password" aria-invalid defaultValue="short" />
                <FieldError>Password must be at least 8 characters.</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </Section>

      <Section title="Rich text editor">
        <RichTextDemo />
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Senior Backend Engineer</CardTitle>
              <CardDescription>Updated 2 hours ago</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Card body content.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Section card (editor accordion)">
        <div className="space-y-3">
          <SectionCard icon={<Briefcase />} title="Work experience" count={2} defaultOpen>
            <p className="text-sm text-muted-foreground">Section content goes here.</p>
          </SectionCard>
          <SectionCard icon={<FileText />} title="Professional summary">
            <p className="text-sm text-muted-foreground">Collapsed by default.</p>
          </SectionCard>
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon={Inbox}
          title="No resumes yet"
          description="Create your first resume to get started."
          action={
            <Button size="sm">
              <Plus data-icon="inline-start" /> New resume
            </Button>
          }
        />
      </Section>
    </div>
  )
}
