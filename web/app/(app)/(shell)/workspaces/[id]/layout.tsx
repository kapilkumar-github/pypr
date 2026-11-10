import { Suspense } from "react"

import { WorkspaceFrame, WorkspaceFrameSkeleton } from "@/components/workspace/workspace-frame"

async function Frame({ params, children }: { params: LayoutProps<"/workspaces/[id]">["params"]; children: React.ReactNode }) {
  const { id } = await params
  return <WorkspaceFrame id={id}>{children}</WorkspaceFrame>
}

/** Every workspace page: the active workspace, a switcher and its section tabs. */
export default function WorkspaceLayout({ params, children }: LayoutProps<"/workspaces/[id]">) {
  return (
    <Suspense fallback={<WorkspaceFrameSkeleton />}>
      <Frame params={params}>{children}</Frame>
    </Suspense>
  )
}
