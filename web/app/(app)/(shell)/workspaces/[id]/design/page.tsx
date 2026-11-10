import type { Metadata } from "next"

import { BoardsView } from "@/components/design/boards-view"

export const metadata: Metadata = { title: "System design" }

export default function DesignPage() {
  return <BoardsView />
}
