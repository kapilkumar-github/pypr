"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useVerified, verifyFirst } from "@/components/app/verify-email"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage, fieldErrors } from "@/lib/api/client"
import { useResumes } from "@/lib/api/resumes"
import { useDeleteWorkspace, useUpdateWorkspace, workspaceToInput } from "@/lib/api/workspaces"
import { contextFromResume } from "@/lib/workspace/meta"
import { useActiveWorkspace } from "./workspace-frame"
import { WorkspaceForm, toFormValues } from "./workspace-form"

export function WorkspaceSettings() {
  const w = useActiveWorkspace()
  const router = useRouter()
  const verified = useVerified()
  const resumes = useResumes()
  const update = useUpdateWorkspace(w.id)
  const remove = useDeleteWorkspace()
  const [confirming, setConfirming] = useState(false)
  const [resumeIds, setResumeIds] = useState(w.resumes.map((r) => r.id))
  const initial = useMemo(() => toFormValues(workspaceToInput(w)), [w])
  const selected = resumes.data?.find((r) => r.id === resumeIds[0])
  const resumeContext = useMemo(() => (selected ? contextFromResume(selected.data) : null), [selected])

  if (resumes.isPending) return <Skeleton className="h-96 max-w-3xl rounded-xl" />

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Changes keep your plan and progress. Earlier versions of this context are kept.</p>
      </div>
      <WorkspaceForm
        key={w.contextVersion}
        mode="edit"
        initial={initial}
        resumes={resumes.data ?? []}
        resumeContext={resumeContext}
        pending={update.isPending}
        error={errorMessage(update.error)}
        fieldErrors={fieldErrors(update.error)}
        onResumeChange={setResumeIds}
        onSubmit={(input) => {
          if (!verified) return verifyFirst()
          update.mutate(input, { onSuccess: () => toast.success("Workspace saved") })
        }}
        footer={
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => (verified ? setConfirming(true) : verifyFirst())}>
            <Trash2 data-icon="inline-start" /> Delete workspace
          </Button>
        }
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{w.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the workspace and its plan. Your resumes and skill ratings stay. You can&apos;t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(w.id, {
                  onSuccess: () => {
                    toast.success("Workspace deleted")
                    router.replace("/workspaces")
                  },
                  onError: (err) => toast.error(errorMessage(err) ?? "Couldn't delete the workspace."),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
