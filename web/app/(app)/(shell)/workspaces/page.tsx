import type { Metadata } from "next"

import { WorkspaceList } from "@/components/workspace/workspace-list"

export const metadata: Metadata = { title: "Workspaces" }

export default function WorkspacesPage() {
  return <WorkspaceList />
}
