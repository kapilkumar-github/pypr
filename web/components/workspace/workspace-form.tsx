"use client"

import { useState } from "react"
import { ChevronDown, FileText, Sparkles } from "lucide-react"

import { ChipInput } from "@/components/common/chip-input"
import { FormAlert } from "@/components/common/form-alert"
import { Segmented } from "@/components/common/segmented"
import { SubmitButton } from "@/components/common/submit-button"
import { TextField } from "@/components/common/text-field"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ResumeSummary } from "@/lib/api/resumes"
import type { ModuleKey, Track, WorkspaceInput } from "@/lib/api/workspaces"
import { MODULES, SENIORITIES, TRACKS, defaultModules, defaultName, topicsForRole, type ResumeContext } from "@/lib/workspace/meta"
import { cn } from "@/lib/utils"

/** Form state: skills are split into technologies (also shown in the name) and other topics. */
export type FormValues = Omit<WorkspaceInput, "skills"> & { topics: string[] }

export function toFormValues(input: WorkspaceInput): FormValues {
  const tech = new Set(input.technologies.map((t) => t.toLowerCase()))
  const { skills, ...rest } = input
  return { ...rest, topics: skills.map((s) => s.name).filter((n) => !tech.has(n.toLowerCase())) }
}

export function fromFormValues(v: FormValues, name: string): WorkspaceInput {
  const { topics, ...rest } = v
  const seen = new Set<string>()
  const skills = [...v.technologies, ...topics]
    .filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .map((n) => ({ name: n, area: v.technologies.includes(n) ? "Technologies" : "" }))
  return { ...rest, name, skills }
}

export function WorkspaceForm({
  mode,
  initial,
  resumes,
  resumeContext,
  postingSkills = [],
  pending,
  error,
  fieldErrors,
  onResumeChange,
  onSubmit,
  footer,
}: {
  mode: "create" | "edit"
  initial: FormValues
  resumes: ResumeSummary[]
  /** Context read from the selected resume, used for suggestions. */
  resumeContext: ResumeContext | null
  /** Skills found in a job posting. */
  postingSkills?: string[]
  pending: boolean
  error: string | null
  fieldErrors: Record<string, string>
  onResumeChange?: (ids: string[]) => void
  onSubmit: (input: WorkspaceInput) => void
  footer?: React.ReactNode
}) {
  const [v, setV] = useState(initial)
  const [nameTouched, setNameTouched] = useState(mode === "edit")
  const [modulesTouched, setModulesTouched] = useState(mode === "edit" || initial.modules.length > 0)
  const [more, setMore] = useState(mode === "edit" || !!initial.jobDescription)
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setV((prev) => ({ ...prev, [key]: value }))
  const name = nameTouched ? v.name : defaultName(v.targetRole, v.technologies)
  const modules = modulesTouched ? v.modules : defaultModules(v.track)

  const setTrack = (track: Track) => setV((prev) => ({ ...prev, track }))
  const toggleModule = (key: ModuleKey, on: boolean) => {
    setModulesTouched(true)
    set("modules", on ? [...modules, key] : modules.filter((m) => m !== key))
  }
  const toggleResume = (id: string, on: boolean) => {
    const ids = on ? [...v.resumeIds, id] : v.resumeIds.filter((r) => r !== id)
    set("resumeIds", ids)
    onResumeChange?.(ids)
  }
  const seniorities = v.seniority && !SENIORITIES.includes(v.seniority) ? [v.seniority, ...SENIORITIES] : SENIORITIES
  const current = resumeContext?.currentRole
  const topicSuggestions = [...postingSkills, ...topicsForRole(`${v.targetRole} ${v.seniority}`)]

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(fromFormValues({ ...v, modules }, name))
      }}
      className="space-y-6"
    >
      <FormAlert message={error} />

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6" aria-labelledby="role-heading">
        <div>
          <h2 id="role-heading" className="text-sm font-semibold">
            The role you&apos;re preparing for
          </h2>
          <p className="text-xs text-muted-foreground">Your plan, suggestions and future modules adapt to this.</p>
        </div>
        <FieldGroup>
          <div className="space-y-2">
            <TextField
              id="targetRole"
              label="Target role"
              placeholder="e.g. Lead Backend Engineer"
              value={v.targetRole}
              maxLength={120}
              autoFocus={mode === "create"}
              onChange={(e) => set("targetRole", e.target.value)}
              error={fieldErrors.targetRole}
            />
            {current && v.targetRole.trim().toLowerCase() !== current.toLowerCase() && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  Your resume says <span className="font-medium text-foreground">{current}</span>.
                </span>
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => set("targetRole", current)}>
                  Prepare for the same role
                </button>
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={fieldErrors.seniority ? true : undefined}>
              <FieldLabel htmlFor="seniority">Target seniority</FieldLabel>
              <Select value={v.seniority || undefined} onValueChange={(s) => set("seniority", s)}>
                <SelectTrigger id="seniority" className="w-full">
                  <SelectValue placeholder="Choose a level" />
                </SelectTrigger>
                <SelectContent>
                  {seniorities.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.seniority && <FieldError>{fieldErrors.seniority}</FieldError>}
            </Field>
            <TextField
              id="yearsExperience"
              label="Years of experience"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              value={v.yearsExperience ?? ""}
              onChange={(e) => set("yearsExperience", e.target.value === "" ? null : Math.max(0, Math.min(60, Number(e.target.value))))}
              description={resumeContext?.years != null ? `From your resume's dated roles: about ${resumeContext.years}.` : undefined}
              error={fieldErrors.yearsExperience}
            />
          </div>
          <Field>
            <FieldLabel>Track</FieldLabel>
            <Segmented label="Track" value={v.track} options={TRACKS} onChange={setTrack} className="w-fit" />
          </Field>
          <ChipInput
            id="technologies"
            label="Technologies to focus on"
            placeholder="e.g. Go, Node.js"
            value={v.technologies}
            onChange={(t) => set("technologies", t)}
            suggestions={resumeContext?.skills ?? []}
            suggestionsLabel="From your resume"
            error={fieldErrors.technologies}
            description="Listing a skill doesn't mean you're interview-ready in it: you'll rate each one later."
          />
        </FieldGroup>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-6" aria-labelledby="resume-heading">
        <div>
          <h2 id="resume-heading" className="text-sm font-semibold">
            Resume <span className="font-normal text-muted-foreground">(optional)</span>
          </h2>
          <p className="text-xs text-muted-foreground">Linked, not copied: edits to the resume show up here.</p>
        </div>
        {resumes.length === 0 ? (
          <p className="text-sm text-muted-foreground">You don&apos;t have a resume yet. You can link one later.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {resumes.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-accent/40">
                  <Checkbox checked={v.resumeIds.includes(r.id)} onCheckedChange={(on) => toggleResume(r.id, on === true)} />
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.jobTitle || "No job title"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {fieldErrors.resumeIds && <p className="text-sm text-destructive">{fieldErrors.resumeIds}</p>}
      </section>

      <Collapsible open={more} onOpenChange={setMore} className="rounded-xl border bg-card shadow-xs">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6">
          <span className="text-sm font-semibold">More details</span>
          <span className="text-xs text-muted-foreground">Name, topics, goals, job posting, modules</span>
          <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", more && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t p-4 sm:p-6">
          <FieldGroup>
            <TextField
              id="name"
              label="Workspace name"
              value={name}
              maxLength={120}
              onChange={(e) => {
                setNameTouched(true)
                set("name", e.target.value)
              }}
              description={nameTouched ? undefined : "Made from the role and technologies until you change it."}
              error={fieldErrors.name}
            />
            <ChipInput
              id="topics"
              label="Other topics to prepare"
              placeholder="e.g. Database sharding, Kafka"
              value={v.topics}
              onChange={(t) => set("topics", t)}
              suggestions={topicSuggestions}
              suggestionsLabel={postingSkills.length ? "From the job and role" : "Common for this role"}
              max={30}
              error={fieldErrors.skills}
            />
            <Field data-invalid={fieldErrors.objectives ? true : undefined}>
              <FieldLabel htmlFor="objectives">Preparation goals</FieldLabel>
              <Textarea
                id="objectives"
                value={v.objectives}
                maxLength={2000}
                placeholder="e.g. Interviewing in 6 weeks. Strong on Go, rusty on distributed systems."
                onChange={(e) => set("objectives", e.target.value)}
                className="min-h-20"
              />
              {fieldErrors.objectives && <FieldError>{fieldErrors.objectives}</FieldError>}
            </Field>
            <Field data-invalid={fieldErrors.jobDescription ? true : undefined}>
              <FieldLabel htmlFor="jobDescription">Job description</FieldLabel>
              <Textarea
                id="jobDescription"
                value={v.jobDescription}
                maxLength={20000}
                placeholder="Paste a posting you're targeting (optional)"
                onChange={(e) => set("jobDescription", e.target.value)}
                className="max-h-64 min-h-24"
              />
              <FieldDescription>Used for suggestions only.</FieldDescription>
              {fieldErrors.jobDescription && <FieldError>{fieldErrors.jobDescription}</FieldError>}
            </Field>
            <Field>
              <FieldLabel>Modules</FieldLabel>
              <FieldDescription>
                These modules aren&apos;t built yet. Turning one on shapes your suggested plan now and enables it here when it ships.
              </FieldDescription>
              <ul className="grid gap-2 sm:grid-cols-2">
                {MODULES.map((m) => (
                  <li key={m.key}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted has-data-checked:border-primary">
                      <Checkbox className="mt-0.5" checked={modules.includes(m.key)} onCheckedChange={(on) => toggleModule(m.key, on === true)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {m.name}
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">
                            Planned
                          </Badge>
                        </span>
                        <span className="block text-xs text-muted-foreground">{m.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Field>
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {footer ?? <span />}
        <SubmitButton pending={pending} size="lg">
          {mode === "create" ? (
            <>
              <Sparkles data-icon="inline-start" /> Create workspace
            </>
          ) : (
            "Save changes"
          )}
        </SubmitButton>
      </div>
    </form>
  )
}
