import type { Metadata } from "next"

import { MachineList } from "@/components/machine/machine-list"

export const metadata: Metadata = { title: "Machine coding" }

export default function MachineCodingPage() {
  return <MachineList />
}
