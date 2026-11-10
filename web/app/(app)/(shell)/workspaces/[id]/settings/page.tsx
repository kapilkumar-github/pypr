import type { Metadata } from "next"

import { WorkspaceSettings } from "@/components/workspace/workspace-settings"

export const metadata: Metadata = { title: "Workspace settings" }

export default function WorkspaceSettingsPage() {
  return <WorkspaceSettings />
}
