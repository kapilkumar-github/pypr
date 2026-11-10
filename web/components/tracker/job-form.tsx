"use client"

import { TextField } from "@/components/common/text-field"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useResumes } from "@/lib/api/resumes"
import type { JobInput, JobSource, SalaryPeriod, WorkArrangement } from "@/lib/api/tracker"
import { ARRANGEMENTS, PERIODS, SOURCES } from "@/lib/tracker/meta"

const NONE = "__none"

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  error,
  placeholder,
  allowNone,
}: {
  id: string
  label: string
  value: T | ""
  options: { id: T; name: string }[]
  onChange: (v: T | "") => void
  error?: string
  placeholder?: string
  allowNone?: string
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value || (allowNone ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? "" : (v as T))}>
        <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>{allowNone}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function toNumber(v: string): number | null {
  if (v.trim() === "") return null
  const n = Number(v.replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

function dateTimeLocal(iso: string) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** Every editable field of a job. Used to review extracted details, for manual entry, and to edit. */
export function JobForm({
  value,
  onChange,
  errors,
  mode,
}: {
  value: JobInput
  onChange: (v: JobInput) => void
  errors: Record<string, string>
  mode: "create" | "edit"
}) {
  const resumes = useResumes()
  const set = <K extends keyof JobInput>(k: K, v: JobInput[K]) => onChange({ ...value, [k]: v })
  const text = (k: keyof JobInput) => ({
    value: (value[k] as string | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never),
    error: errors[k],
  })

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Role</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="job-title" label="Job title" required maxLength={300} {...text("title")} />
          <TextField id="job-company" label="Company" required maxLength={200} {...text("company")} />
          <TextField id="job-location" label="Location" placeholder="e.g. Berlin, Germany" maxLength={300} {...text("location")} />
          <SelectField<WorkArrangement>
            id="job-arrangement"
            label="Work arrangement"
            value={value.workArrangement}
            options={ARRANGEMENTS}
            onChange={(v) => set("workArrangement", v || "unknown")}
            error={errors.workArrangement}
          />
          <TextField
            id="job-type"
            label="Employment type"
            placeholder="e.g. full time, contract"
            maxLength={100}
            {...text("employmentType")}
          />
          {mode === "create" && (
            <SelectField<"saved" | "preparing">
              id="job-status"
              label="Start as"
              value={value.status ?? "saved"}
              options={[
                { id: "saved", name: "Saved" },
                { id: "preparing", name: "Preparing" },
              ]}
              onChange={(v) => set("status", v || "saved")}
              error={errors.status}
            />
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Links and IDs</h2>
          <p className="text-xs text-muted-foreground">
            Where you found the job and where you apply can differ, e.g. a LinkedIn post that leads to Workday.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="job-discovery" type="url" label="Found at" placeholder="https://" {...text("discoveryUrl")} />
          <TextField id="job-apply-url" type="url" label="Application page" placeholder="https://" {...text("applicationUrl")} />
          <SelectField<JobSource>
            id="job-source"
            label="Source"
            value={value.source}
            options={SOURCES}
            onChange={(v) => set("source", v)}
            error={errors.source}
            allowNone="Not set"
          />
          <TextField id="job-external-id" label="Job ID on that site" maxLength={200} {...text("externalId")} />
          <TextField
            id="job-portal"
            type="url"
            label="Candidate portal"
            placeholder="https://"
            description="Where you check the application, if the employer gave you one."
            {...text("portalUrl")}
          />
          <TextField
            id="job-ref"
            label="Application reference"
            maxLength={200}
            description="Confirmation or candidate number."
            {...text("applicationRef")}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Salary (optional)</h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <TextField
            id="job-salary-min"
            inputMode="decimal"
            label="From"
            value={value.salaryMin ?? ""}
            onChange={(e) => set("salaryMin", toNumber(e.target.value))}
            error={errors.salaryMin}
          />
          <TextField
            id="job-salary-max"
            inputMode="decimal"
            label="To"
            value={value.salaryMax ?? ""}
            onChange={(e) => set("salaryMax", toNumber(e.target.value))}
            error={errors.salaryMax}
          />
          <TextField
            id="job-currency"
            label="Currency"
            placeholder="USD"
            maxLength={3}
            value={value.salaryCurrency}
            onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase())}
            error={errors.salaryCurrency}
          />
          <SelectField<SalaryPeriod & string>
            id="job-period"
            label="Period"
            value={value.salaryPeriod}
            options={PERIODS}
            onChange={(v) => set("salaryPeriod", v)}
            error={errors.salaryPeriod}
            allowNone="Not set"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Preparation</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={errors.resumeId ? true : undefined}>
            <FieldLabel htmlFor="job-resume">Resume you&apos;re preparing</FieldLabel>
            <Select value={value.resumeId ?? NONE} onValueChange={(v) => set("resumeId", v === NONE ? null : v)}>
              <SelectTrigger id="job-resume" className="w-full" aria-invalid={errors.resumeId ? true : undefined}>
                <SelectValue placeholder={resumes.isPending ? "Loading…" : "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {resumes.data?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Optional. The submitted version is saved when you confirm applying.</FieldDescription>
            {errors.resumeId && <FieldError>{errors.resumeId}</FieldError>}
          </Field>
          {mode === "edit" && value.appliedAt && (
            <TextField
              id="job-applied-at"
              type="datetime-local"
              label="Applied on"
              value={dateTimeLocal(value.appliedAt)}
              onChange={(e) => e.target.value && set("appliedAt", new Date(e.target.value).toISOString())}
              description="Correct it if needed. It can't be removed."
              error={errors.appliedAt}
            />
          )}
        </div>
      </section>

      <section className="space-y-2">
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="job-description">Job description</FieldLabel>
          <Textarea
            id="job-description"
            className="min-h-48"
            value={value.description}
            onChange={(e) => set("description", e.target.value)}
            aria-invalid={errors.description ? true : undefined}
          />
          <FieldDescription>Kept in Pypr, so you still have it if the listing comes down.</FieldDescription>
          {errors.description && <FieldError>{errors.description}</FieldError>}
        </Field>
      </section>

      {mode === "create" && (
        <Field data-invalid={errors.note ? true : undefined}>
          <FieldLabel htmlFor="job-note">Note (optional)</FieldLabel>
          <Textarea
            id="job-note"
            value={value.note ?? ""}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Who referred you, why it fits…"
          />
          {errors.note && <FieldError>{errors.note}</FieldError>}
        </Field>
      )}
    </div>
  )
}
