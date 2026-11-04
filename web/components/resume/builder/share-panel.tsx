"use client"

import { useState } from "react"
import { Check, Copy, Download, ExternalLink, Eye, Globe } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { useSharing, useUpdateSharing, type Sharing, type SharingInput } from "@/lib/api/resumes"
import { cn } from "@/lib/utils"

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

/** Share mode: public web page, its address, privacy options and visitor counts. */
export function SharePanel({ resumeId, suggestedSlug }: { resumeId: string; suggestedSlug: string }) {
  const sharing = useSharing(resumeId)

  if (sharing.isPending) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }
  if (sharing.isError) return <p className="p-4 text-sm text-destructive">Couldn&apos;t load sharing settings.</p>
  return <ShareForm key={resumeId} resumeId={resumeId} value={sharing.data} suggestedSlug={suggestedSlug} />
}

function ShareForm({ resumeId, value, suggestedSlug }: { resumeId: string; value: Sharing; suggestedSlug: string }) {
  const update = useUpdateSharing(resumeId)
  const [slug, setSlug] = useState(value.slug || slugify(suggestedSlug))
  const [copied, setCopied] = useState(false)
  const url = value.slug ? `${window.location.origin}/r/${value.slug}` : ""
  const slugError = fieldErrors(update.error).slug

  const save = (patch: Partial<SharingInput>) => {
    const next: SharingInput = {
      public: value.public,
      slug: value.slug,
      hideContact: value.hideContact,
      allowDownload: value.allowDownload,
      indexable: value.indexable,
      ...patch,
    }
    update.mutate(next, {
      onError: (err) => {
        if (!fieldErrors(err).slug) toast.error(errorMessage(err) ?? "Couldn't save sharing settings.")
      },
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy. Your browser blocked clipboard access.")
    }
  }

  return (
    <div className="space-y-4 p-3">
      <label
        htmlFor="share-public"
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
          value.public ? "border-success/40 bg-success/10" : "bg-card",
        )}
      >
        <Globe className={cn("mt-0.5 size-4", value.public ? "text-success" : "text-muted-foreground")} />
        <span className="flex-1">
          <span className="block text-sm font-semibold">Public link</span>
          <span className="block text-xs text-muted-foreground">
            {value.public ? "On. Anyone with the link can see your web page." : "Off. Only you can see this resume."}
          </span>
        </span>
        <Checkbox
          id="share-public"
          checked={value.public}
          disabled={update.isPending}
          onCheckedChange={(c) => save({ public: c === true, slug: value.slug || slugify(slug) })}
        />
      </label>

      <section className="space-y-2 rounded-xl border bg-card p-3">
        <label htmlFor="share-slug" className="text-xs font-medium text-muted-foreground">
          Address
        </label>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save({ slug: slugify(slug) })
          }}
        >
          <div className="flex min-w-0 flex-1 items-center rounded-lg border bg-background pl-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <span className="shrink-0 font-mono text-xs text-muted-foreground">/r/</span>
            <input
              id="share-slug"
              value={slug}
              maxLength={60}
              spellCheck={false}
              aria-invalid={!!slugError || undefined}
              aria-describedby={slugError ? "share-slug-error" : undefined}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              className="h-9 min-w-0 flex-1 bg-transparent pr-2 font-mono text-sm outline-none"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" disabled={update.isPending || slugify(slug) === value.slug || slugify(slug).length < 3}>
            Save
          </Button>
        </form>
        {slugError && (
          <p id="share-slug-error" className="text-xs text-destructive">
            {slugError}
          </p>
        )}
        {url && (
          <>
            <p className="truncate font-mono text-xs text-muted-foreground">{url.replace(/^https?:\/\//, "")}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={copy}>
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />} {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" asChild disabled={!value.public}>
                <a href={value.public ? url : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!value.public}>
                  <ExternalLink data-icon="inline-start" /> Open web page
                </a>
              </Button>
            </div>
            {!value.public && <p className="text-xs text-muted-foreground">Turn on the public link to open the page.</p>}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-3">
        <p className="text-sm font-semibold">Privacy</p>
        <Option
          id="share-hide-contact"
          label="Hide contact details"
          note="Email, phone, location, links and references' contact lines are left out of the web page and its PDF."
          checked={value.hideContact}
          disabled={update.isPending}
          onChange={(hideContact) => save({ hideContact })}
        />
        <Option
          id="share-download"
          label="Visitors can download the PDF"
          checked={value.allowDownload}
          disabled={update.isPending}
          onChange={(allowDownload) => save({ allowDownload })}
        />
        <Option
          id="share-index"
          label="Show in search engines"
          note={value.indexable ? "On. Search engines may list your page." : "Off. Search engines are asked not to list it."}
          checked={value.indexable}
          disabled={update.isPending}
          onChange={(indexable) => save({ indexable })}
        />
      </section>

      <section className="rounded-xl border bg-card p-3">
        <p className="text-sm font-semibold">Visitors</p>
        <p className="text-xs text-muted-foreground">Only you see these. Your own visits count too.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat icon={<Eye />} label="Views" value={value.views} />
          <Stat icon={<Download />} label="Downloads" value={value.downloads} />
        </div>
      </section>
    </div>
  )
}

function Option({
  id,
  label,
  note,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  note?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <span className="flex-1">
        <span className="block text-sm">{label}</span>
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </span>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(c) => onChange(c === true)} />
    </label>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon} {label}
      </p>
      <p className="font-mono text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}
