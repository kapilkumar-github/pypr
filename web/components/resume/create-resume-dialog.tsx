"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FilePlus2, FileText, Plus } from "lucide-react"

import { FormAlert } from "@/components/common/form-alert"
import { SubmitButton } from "@/components/common/submit-button"
import { TextField } from "@/components/common/text-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { useVerified, verifyFirst } from "@/components/app/verify-email"
import { useCreateResume } from "@/lib/api/resumes"
import { blankResume, softwareEngineerExample } from "@/lib/resume/defaults"
import { cn } from "@/lib/utils"

const starts = [
  { id: "blank", label: "Blank", description: "Start from an empty resume.", icon: FilePlus2 },
  { id: "example", label: "Software Engineer example", description: "Edit a filled-in sample.", icon: FileText },
] as const

export function CreateResumeDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [start, setStart] = useState<(typeof starts)[number]["id"]>("blank")
  const create = useCreateResume()
  const verified = useVerified()

  function onOpenChange(next: boolean) {
    if (next && !verified) {
      verifyFirst()
      return
    }
    setOpen(next)
    if (!next) {
      setTitle("")
      setStart("blank")
      create.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus data-icon="inline-start" /> New resume
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              { title, data: start === "example" ? softwareEngineerExample() : blankResume() },
              { onSuccess: (r) => router.push(`/resumes/${r.id}`) },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>New resume</DialogTitle>
            <DialogDescription>Name it after the role you&apos;re targeting.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <FormAlert message={errorMessage(create.error)} />
            <TextField
              id="resume-title"
              label="Title"
              placeholder="e.g. Senior Backend Engineer"
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={fieldErrors(create.error).title}
            />
            <Field>
              <FieldLabel id="start-label">Start from</FieldLabel>
              <div role="radiogroup" aria-labelledby="start-label" className="grid gap-2 sm:grid-cols-2">
                {starts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={start === s.id}
                    onClick={() => setStart(s.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      start === s.id ? "border-primary bg-accent ring-1 ring-primary" : "hover:bg-muted",
                    )}
                  >
                    <s.icon className="size-4 text-primary" />
                    <span className="text-xs font-semibold">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.description}</span>
                  </button>
                ))}
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={create.isPending || create.isSuccess}>Create resume</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
