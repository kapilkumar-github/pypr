import type { Metadata } from "next"

import { VerifyHarness } from "@/components/code/verify"

export const metadata: Metadata = { title: "Verify", robots: { index: false } }

export default function VerifyPage() {
  return <VerifyHarness />
}
